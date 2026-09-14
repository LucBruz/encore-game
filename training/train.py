"""
Reseau de valeur pour Encore! — entrainement.

    training/.venv/Scripts/python.exe training/train.py --epochs 6 --out public/data/value-net.json

Apprend, pour une feuille APRES un coup, le score final du joueur et sa marge sur
le meilleur adversaire, a partir des parties d'auto-jeu de `scripts/gen-dataset.ts`
passees par `scripts/featurize.ts` (format decrit dans ce dernier).

Separation : les tranches sont des parties disjointes. La derniere tranche sert
de validation ; le vrai test est un duel sur des graines jamais vues
(5250000, voir `gen-dataset.ts`).

Architecture, choisie pour l'inference en TypeScript :
    creuses (735) -> lineaire H -> ReLU --+
                                           +-> 64 -> ReLU -> 32 -> ReLU -> 2
    denses (61) --------------------------+
La premiere couche se somme sur les seules entrees actives (quelques dizaines de
cases cochees), comme le premier etage d'un NNUE : un coup candidat coute
quelques milliers d'operations.
"""
import argparse
import base64
import glob
import json
import math
import os
import time

import numpy as np
import torch
import torch.nn as nn

CELLS = 105
SPARSE = CELLS * 7
DENSE = 61
TARGET_SCALE = 30.0
FEAT = np.dtype([
    ("grid", "u1"), ("n", "u1"), ("score", "i1"), ("margin", "i1"),
    ("mask", "u1", 14), ("opp", "u1", 27), ("dense", "<f2", DENSE), ("turn", "u1"),
])
assert FEAT.itemsize == 168


class ValueNet(nn.Module):
    def __init__(self, hidden: int):
        super().__init__()
        self.acc = nn.Linear(SPARSE, hidden)
        self.fc1 = nn.Linear(hidden + DENSE, 64)
        self.fc2 = nn.Linear(64, 32)
        self.out = nn.Linear(32, 2)

    def forward(self, sparse, dense):
        x = torch.relu(self.acc(sparse))
        x = torch.relu(self.fc1(torch.cat([x, dense], dim=1)))
        x = torch.relu(self.fc2(x))
        return self.out(x)


class Expander:
    """Deplie masques et comptes en plans creux, sur le GPU. Miroir exact de `accumulate` dans valueNet.ts."""

    def __init__(self, grids_path, device):
        grids = json.load(open(grids_path))
        colors = torch.tensor([g["colors"] for g in grids], device=device)
        self.color_onehot = torch.nn.functional.one_hot(colors, 5).float()  # (G, 105, 5)
        self.star = torch.tensor([g["stars"] for g in grids], device=device).float()  # (G, 105)
        idx = torch.arange(CELLS, device=device)
        self.mask_byte, self.mask_bit = idx >> 3, idx & 7
        self.opp_byte, self.opp_shift = idx >> 2, 2 * (idx & 3)

    def __call__(self, grid, n, mask, opp):
        # Octets stockes en uint8 sur le GPU (4 fois moins de memoire que int64), convertis par lot.
        me = ((mask[:, self.mask_byte].int() >> self.mask_bit.int()) & 1).float()
        counts = ((opp[:, self.opp_byte].int() >> self.opp_shift.int()) & 3).float()
        opponents = (n.float() - 1).clamp(min=1).unsqueeze(1)
        cell_color = (me.unsqueeze(2) * self.color_onehot[grid]).reshape(-1, CELLS * 5)
        stars = me * self.star[grid]
        return torch.cat([cell_color, stars, counts / opponents], dim=1)


def load(paths, device):
    arrays = [np.fromfile(p, dtype=FEAT) for p in paths]
    a = np.concatenate(arrays) if len(arrays) > 1 else arrays[0]
    t = lambda x, dt: torch.from_numpy(np.ascontiguousarray(x)).to(device=device, dtype=dt)
    return {
        "grid": t(a["grid"], torch.long), "n": t(a["n"], torch.long),
        "mask": t(a["mask"], torch.uint8), "opp": t(a["opp"], torch.uint8),
        "dense": t(a["dense"], torch.float16),
        "target": t(np.stack([a["score"], a["margin"]], axis=1), torch.float32) / TARGET_SCALE,
        "size": len(a),
    }


def batches(data, batch_size, shuffle, device):
    order = torch.randperm(data["size"], device=device) if shuffle else torch.arange(data["size"], device=device)
    for start in range(0, data["size"], batch_size):
        yield order[start:start + batch_size]


def evaluate(model, expand, data, batch_size, device):
    model.eval()
    se = torch.zeros(2, device=device, dtype=torch.float64)
    with torch.no_grad():
        for idx in batches(data, batch_size, False, device):
            sparse = expand(data["grid"][idx], data["n"][idx], data["mask"][idx], data["opp"][idx])
            pred = model(sparse, data["dense"][idx].float())
            se += ((pred - data["target"][idx]) ** 2).sum(0).double()
    model.train()
    mse = se / data["size"]
    return (mse.sqrt() * TARGET_SCALE).tolist()


def export(model, path, meta):
    def lin(layer):
        return {
            "in": layer.in_features, "out": layer.out_features,
            "w": base64.b64encode(layer.weight.detach().cpu().float().numpy().astype("<f4").tobytes()).decode(),
            "b": base64.b64encode(layer.bias.detach().cpu().float().numpy().astype("<f4").tobytes()).decode(),
        }
    net = {
        "format": "encore-value-net/1",
        "sparse": SPARSE, "dense": DENSE, "targetScale": TARGET_SCALE, "heads": ["score", "margin"],
        "acc": lin(model.acc), "fc1": lin(model.fc1), "fc2": lin(model.fc2), "out": lin(model.out),
        "meta": meta,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(net, open(path, "w"))


def write_parity(model, expand, data, path, device, count=48):
    """Enregistrements bruts et sorties attendues : le test TypeScript doit retrouver les memes nombres."""
    idx = torch.arange(count, device=device)
    with torch.no_grad():
        sparse = expand(data["grid"][idx], data["n"][idx], data["mask"][idx], data["opp"][idx])
        pred = model.eval()(sparse, data["dense"][idx].float()) * TARGET_SCALE
    model.train()
    records = {
        "grid": data["grid"][idx].tolist(), "n": data["n"][idx].tolist(),
        "mask": data["mask"][idx].tolist(), "opp": data["opp"][idx].tolist(),
        "dense": data["dense"][idx].float().tolist(),
        "expected": pred.tolist(),
    }
    json.dump(records, open(path, "w"))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="training/data")
    p.add_argument("--val-shards", default="9")
    p.add_argument("--hidden", type=int, default=128)
    p.add_argument("--epochs", type=int, default=6)
    p.add_argument("--batch", type=int, default=8192)
    p.add_argument("--lr", type=float, default=2e-3)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--out", default="public/data/value-net.json")
    p.add_argument("--parity", default="bots/__tests__/fixtures/value-net-parity.json")
    args = p.parse_args()

    torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    val_ids = {int(s) for s in args.val_shards.split(",")}
    shards = sorted(glob.glob(os.path.join(args.data, "feat-[0-9]*.bin")))
    shard_id = lambda path: int(os.path.basename(path)[5:-4])
    train_paths = [s for s in shards if shard_id(s) not in val_ids]
    val_paths = [s for s in shards if shard_id(s) in val_ids]

    t0 = time.time()
    train, val = load(train_paths, device), load(val_paths, device)
    print(f"{train['size']:,} positions d'entrainement ({len(train_paths)} tranches), "
          f"{val['size']:,} de validation, chargees en {time.time() - t0:.1f} s sur {device}")

    expand = Expander(os.path.join(args.data, "grids.json"), device)
    model = ValueNet(args.hidden).to(device)
    params = sum(x.numel() for x in model.parameters())

    # Reference : predire la moyenne. Le reseau doit faire nettement mieux pour valoir quelque chose.
    mean = train["target"].mean(0)
    base = (((val["target"] - mean) ** 2).mean(0).sqrt() * TARGET_SCALE).tolist()
    print(f"{params:,} parametres. Reference (moyenne) : RMSE score {base[0]:.2f}, marge {base[1]:.2f} points")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    steps = args.epochs * math.ceil(train["size"] / args.batch)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps, pct_start=0.05)
    history = []

    for epoch in range(args.epochs):
        t0 = time.time()
        running, seen = 0.0, 0
        for idx in batches(train, args.batch, True, device):
            sparse = expand(train["grid"][idx], train["n"][idx], train["mask"][idx], train["opp"][idx])
            pred = model(sparse, train["dense"][idx].float())
            loss = ((pred - train["target"][idx]) ** 2).mean()
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sched.step()
            running += loss.item() * len(idx)
            seen += len(idx)
        rmse = evaluate(model, expand, val, args.batch, device)
        train_rmse = math.sqrt(running / seen) * TARGET_SCALE
        history.append({"epoch": epoch + 1, "trainRmse": train_rmse, "valRmseScore": rmse[0], "valRmseMargin": rmse[1]})
        print(f"  epoque {epoch + 1}/{args.epochs} : entrainement {train_rmse:.3f}, "
              f"validation score {rmse[0]:.3f} / marge {rmse[1]:.3f} ({time.time() - t0:.0f} s)")

    meta = {
        "trainPositions": train["size"], "valPositions": val["size"], "hidden": args.hidden,
        "epochs": args.epochs, "baselineRmse": base, "history": history,
    }
    export(model, args.out, meta)
    os.makedirs(os.path.dirname(args.parity), exist_ok=True)
    write_parity(model, expand, val, args.parity, device)
    print(f"Ecrit {args.out} et {args.parity}")


if __name__ == "__main__":
    main()
