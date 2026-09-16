"""
Reseau de valeur, etape 2 : apprendre a COMPARER les coups d'une meme position.

    training/.venv/Scripts/python.exe training/train_rollouts.py \
        --data training/data/<round> --init public/data/value-net-mix.json --head margin \
        --out training/runs/<round>/value-net.json

Donnees : `scripts/gen-rollouts.ts` (plusieurs coups par position, chacun evalue
par deroulements apparies sous v3-multi) passees par `scripts/featurize.ts`
(`rfeat-<k>.bin`), cibles dans `roll-<k>.bin.targets`.

Deux pertes, sommees :
  - absolue : predire la valeur moyenne de chaque coup ;
  - de contraste : predire l'ECART de chaque coup a la moyenne de sa position.
    C'est ce qui manquait au premier reseau, qui n'avait jamais vu deux coups
    d'une meme position et prenait ses « derivees » (le prix d'un joker) dans des
    comparaisons entre positions differentes.

Indicateur de validation qui compte pour jouer : le REGRET, ce que coute en
points le coup choisi par le reseau par rapport au meilleur coup mesure, compare
au regret du coup de v3. Le choix du reseau ne depend pas du bruit des cibles de
validation, donc la comparaison est loyale ; le maximum mesure, lui, est flatte
par le bruit, mais de la meme facon pour les deux.
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

from train import CELLS, DENSE, FEAT, TARGET_SCALE, Expander, ValueNet, export, write_parity

TARGETS = np.dtype([("score", "<f4"), ("margin", "<f4"), ("group", "<u4"), ("flags", "u1"), ("k", "u1"), ("pad", "<u2")])
assert TARGETS.itemsize == 16


def load_init(model, path):
    net = json.load(open(path))
    for name in ("acc", "fc1", "fc2", "out"):
        layer = getattr(model, name)
        w = np.frombuffer(base64.b64decode(net[name]["w"]), dtype="<f4").reshape(layer.weight.shape)
        b = np.frombuffer(base64.b64decode(net[name]["b"]), dtype="<f4")
        with torch.no_grad():
            layer.weight.copy_(torch.from_numpy(w.copy()))
            layer.bias.copy_(torch.from_numpy(b.copy()))


def load(shards, data_dir, device):
    feats, targets = [], []
    for k in shards:
        f = np.fromfile(os.path.join(data_dir, f"rfeat-{k}.bin"), dtype=FEAT)
        t = np.fromfile(os.path.join(data_dir, f"roll-{k}.bin.targets"), dtype=TARGETS)
        assert len(f) == len(t), f"tranche {k} : {len(f)} positions, {len(t)} cibles"
        feats.append(f)
        targets.append(t)
    f = np.concatenate(feats)
    t = np.concatenate(targets)

    # Les candidats d'une position sont contigus : on reconstruit la matrice (positions, K).
    starts = np.concatenate([[0], np.flatnonzero(np.diff(t["group"].astype(np.int64)) != 0) + 1])
    ends = np.concatenate([starts[1:], [len(t)]])
    kmax = int((ends - starts).max())
    gidx = np.full((len(starts), kmax), -1, dtype=np.int64)
    for j in range(kmax):
        valid = starts + j < ends
        gidx[valid, j] = starts[valid] + j

    dev = lambda x, dt: torch.from_numpy(np.ascontiguousarray(x)).to(device=device, dtype=dt)
    return {
        "grid": dev(f["grid"], torch.long), "n": dev(f["n"], torch.long),
        "mask": dev(f["mask"], torch.uint8), "opp": dev(f["opp"], torch.uint8),
        "dense": dev(f["dense"], torch.float16),
        "target": dev(np.stack([t["score"], t["margin"]], axis=1), torch.float32) / TARGET_SCALE,
        "v3best": dev(t["flags"] & 1, torch.bool),
        "gidx": dev(gidx, torch.long),
        "positions": len(starts), "records": len(t),
    }


def group_forward(model, expand, data, groups):
    idx = data["gidx"][groups]                  # (G, K), -1 = vide
    valid = idx >= 0
    flat = idx[valid]
    sparse = expand(data["grid"][flat], data["n"][flat], data["mask"][flat], data["opp"][flat])
    pred_flat = model(sparse, data["dense"][flat].float())
    pred = torch.zeros(*idx.shape, 2, device=idx.device)
    pred[valid] = pred_flat
    target = torch.zeros_like(pred)
    target[valid] = data["target"][flat]
    return pred, target, valid, idx


def losses(pred, target, valid, contrast_weight, abs_weight):
    v = valid.unsqueeze(2).float()
    count = v.sum(1, keepdim=True).clamp(min=1)
    abs_loss = (((pred - target) ** 2) * v).sum() / v.sum() / 2
    centered_p = pred - (pred * v).sum(1, keepdim=True) / count
    centered_t = target - (target * v).sum(1, keepdim=True) / count
    contrast = (((centered_p - centered_t) ** 2) * v).sum() / v.sum() / 2
    return abs_weight * abs_loss + contrast_weight * contrast, abs_loss, contrast


def validate(model, expand, data, head, device, batch=4096):
    model.eval()
    totals = {"abs": 0.0, "contrast": 0.0, "regret_net": 0.0, "regret_v3": 0.0, "agree": 0.0, "n": 0}
    with torch.no_grad():
        for start in range(0, data["positions"], batch):
            groups = torch.arange(start, min(start + batch, data["positions"]), device=device)
            pred, target, valid, idx = group_forward(model, expand, data, groups)
            _, abs_loss, contrast = losses(pred, target, valid, 1.0, 1.0)
            g = len(groups)
            totals["abs"] += abs_loss.item() * g
            totals["contrast"] += contrast.item() * g
            p = pred[:, :, head].masked_fill(~valid, -1e9)
            t = target[:, :, head].masked_fill(~valid, -1e9)
            best_t = t.max(1).values
            pick_net = p.argmax(1)
            v3flags = torch.zeros_like(valid)
            v3flags[valid] = data["v3best"][idx[valid]]
            pick_v3 = v3flags.float().argmax(1)
            rows = torch.arange(g, device=device)
            totals["regret_net"] += (best_t - t[rows, pick_net]).sum().item()
            totals["regret_v3"] += (best_t - t[rows, pick_v3]).sum().item()
            totals["agree"] += (pick_net == pick_v3).float().sum().item()
            totals["n"] += g
    model.train()
    n = totals["n"]
    return {
        "rmseAbs": math.sqrt(totals["abs"] / n) * TARGET_SCALE,
        "rmseContrast": math.sqrt(totals["contrast"] / n) * TARGET_SCALE,
        "regretNet": totals["regret_net"] / n * TARGET_SCALE,
        "regretV3": totals["regret_v3"] / n * TARGET_SCALE,
        "agreeV3": totals["agree"] / n,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="training/data")
    p.add_argument("--val-shards", default="9")
    p.add_argument("--init", default="public/data/value-net-mix.json")
    p.add_argument("--hidden", type=int, default=128)
    p.add_argument("--epochs", type=int, default=20)
    p.add_argument("--groups", type=int, default=512, help="positions par lot")
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--contrast", type=float, default=1.0)
    p.add_argument("--absolute", type=float, default=0.25)
    p.add_argument("--head", default="score", choices=["score", "margin"])
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--out", default="training/runs/rollouts/value-net.json")
    p.add_argument("--parity", default="training/runs/rollouts/parity.json")
    args = p.parse_args()

    torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    present = sorted(int(os.path.basename(x)[6:-4]) for x in glob.glob(os.path.join(args.data, "rfeat-[0-9]*.bin")))
    val_ids = [int(s) for s in args.val_shards.split(",")]
    train_ids = [k for k in present if k not in val_ids]
    head = 0 if args.head == "score" else 1

    train, val = load(train_ids, args.data, device), load(val_ids, args.data, device)
    print(f"entrainement : {train['positions']:,} positions / {train['records']:,} coups (tranches {train_ids}) ; "
          f"validation : {val['positions']:,} / {val['records']:,}")

    expand = Expander(os.path.join(args.data, "grids.json"), device)
    model = ValueNet(args.hidden).to(device)
    if args.init:
        load_init(model, args.init)
        print(f"initialise depuis {args.init}")
    start = validate(model, expand, val, head, device)
    print(f"  depart : {json.dumps({k: round(v, 3) for k, v in start.items()})}")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    steps = args.epochs * math.ceil(train["positions"] / args.groups)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps, pct_start=0.1)
    history = [{"epoch": 0, **start}]
    # Arret precoce sur le regret de validation : mesure faite, avec 15 000 positions
    # le regret descend jusqu'a l'epoque 4 puis remonte (sur-apprentissage). Choisir
    # l'epoque sur la validation flatte le chiffre de validation lui-meme ; le juge
    # reste le duel sur graines jamais vues.
    snapshot = lambda: {k: v.detach().clone() for k, v in model.state_dict().items()}
    best = {"epoch": 0, "regret": start["regretNet"], "state": snapshot()}

    for epoch in range(args.epochs):
        t0 = time.time()
        perm = torch.randperm(train["positions"], device=device)
        for s in range(0, train["positions"], args.groups):
            pred, target, valid, _ = group_forward(model, expand, train, perm[s:s + args.groups])
            loss, _, _ = losses(pred, target, valid, args.contrast, args.absolute)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sched.step()
        m = validate(model, expand, val, head, device)
        history.append({"epoch": epoch + 1, **m})
        print(f"  epoque {epoch + 1}/{args.epochs} ({time.time() - t0:.0f} s) : "
              f"regret reseau {m['regretNet']:.3f} / v3 {m['regretV3']:.3f}, accord v3 {100 * m['agreeV3']:.1f} %, "
              f"RMSE contraste {m['rmseContrast']:.3f}, absolue {m['rmseAbs']:.3f}")
        if m["regretNet"] < best["regret"]:
            best = {"epoch": epoch + 1, "regret": m["regretNet"], "state": snapshot()}

    model.load_state_dict(best["state"])
    print(f"  epoque retenue : {best['epoch']} (regret de validation {best['regret']:.3f})")
    export(model, args.out, {
        "stage": "rollouts", "init": args.init, "bestEpoch": best["epoch"], "trainPositions": train["positions"], "trainMoves": train["records"],
        "valPositions": val["positions"], "epochs": args.epochs, "contrast": args.contrast, "absolute": args.absolute,
        "history": history,
    })
    # Fichier de parite au meme format que l'etape 1 : memes champs, lus par le test TypeScript.
    flat = {"size": val["records"], **{k: val[k] for k in ("grid", "n", "mask", "opp", "dense")}}
    os.makedirs(os.path.dirname(args.parity), exist_ok=True)
    write_parity(model, expand, flat, args.parity, device)
    print(f"Ecrit {args.out} et {args.parity}")


if __name__ == "__main__":
    main()
