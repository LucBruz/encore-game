/**
 * Positions brutes d'auto-jeu -> entrees du reseau de valeur.
 *
 *   npx tsx scripts/featurize.ts --in training/data/train-0.bin --out training/data/feat-0.bin
 *
 * Les entrees denses sont calculees ICI, par `bots/valueFeatures.ts`, le code
 * meme qu'appelle le bot en jeu. Python ne fait que deplier les masques.
 *
 * Enregistrement de 168 octets, petit-boutiste :
 *   0     u8      indice de grille (ALL_GRIDS)
 *   1     u8      nombre de joueurs
 *   2     i8      score final du joueur qui decide
 *   3     i8      marge : ce score moins le meilleur score adverse
 *   4     14 o.   masque du joueur apres son coup, 1 bit par case (bit i&7 de l'octet i>>3)
 *   18    27 o.   nombre d'adversaires ayant coche chaque case, 2 bits (bits 2*(i&3) de l'octet i>>2)
 *   45    61 f16  entrees denses (`denseFeatures`)
 *   167   u8      tour
 *
 * Ecrit aussi `training/data/grids.json` : couleur et etoile de chaque case des
 * 8 grilles, dans l'ordre d'ALL_GRIDS, pour que Python deplie les plans creux.
 */
import { closeSync, openSync, readSync, writeFileSync, writeSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { CELL_COUNT } from '../engine/grid'
import { DEFAULT_TOTAL_JOKERS } from '../engine/state'
import { DENSE_SIZE, denseFeatures, gridInfo, summarizeOpponents } from '../bots/valueFeatures'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const IN = arg('in', 'training/data/probe.bin')
const OUT = arg('out', 'training/data/feat-probe.bin')

export const RAW_BYTES = 96
export const FEAT_BYTES = 168
const SLOT_BYTES = 21
const MASK_BYTES = 14
const SCORES_OFF = 4 + 4 * SLOT_BYTES

writeFileSync('training/data/grids.json', JSON.stringify(ALL_GRIDS.map(g => ({
    id: g.id,
    colors: g.cells.map(c => 'gybpo'.indexOf(c[0])),
    stars: g.cells.map(c => (c[1] ? 1 : 0)),
}))))

const CHUNK = 65536
const input = openSync(IN, 'r')
const output = openSync(OUT, 'w')
const raw = Buffer.alloc(CHUNK * RAW_BYTES)
const out = Buffer.alloc(CHUNK * FEAT_BYTES)
const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
const dense = new Float32Array(DENSE_SIZE)
const masks = Array.from({ length: 4 }, () => new Uint8Array(CELL_COUNT))
const started = Date.now()
let total = 0

for (;;) {
    const bytes = readSync(input, raw, 0, raw.length, null)
    const count = Math.floor(bytes / RAW_BYTES)
    if (count === 0) break
    out.fill(0, 0, count * FEAT_BYTES)

    for (let r = 0; r < count; r++) {
        const ro = r * RAW_BYTES
        const fo = r * FEAT_BYTES
        const grid = raw[ro]
        const turn = raw[ro + 1]
        const n = raw[ro + 2]
        const isActive = (raw[ro + 3] & 1) === 1

        for (let s = 0; s < n; s++) {
            const base = ro + 4 + s * SLOT_BYTES
            const m = masks[s]
            for (let i = 0; i < CELL_COUNT; i++) m[i] = (raw[base + (i >> 3)] >> (i & 7)) & 1
        }
        const jokersUsed = raw[ro + 4 + MASK_BYTES]
        const opponents = masks.slice(1, n)
        const info = gridInfo(ALL_GRIDS[grid].cells)
        denseFeatures(info, masks[0], jokersUsed, summarizeOpponents(info, opponents), turn, isActive, DEFAULT_TOTAL_JOKERS, dense)

        const score = raw.readInt8(ro + SCORES_OFF)
        let bestOther = -Infinity
        for (let s = 1; s < n; s++) bestOther = Math.max(bestOther, raw.readInt8(ro + SCORES_OFF + s))

        out[fo] = grid
        out[fo + 1] = n
        out.writeInt8(score, fo + 2)
        out.writeInt8(Math.max(-128, Math.min(127, score - bestOther)), fo + 3)
        raw.copy(out, fo + 4, ro + 4, ro + 4 + MASK_BYTES)
        for (let i = 0; i < CELL_COUNT; i++) {
            let c = 0
            for (const m of opponents) c += m[i]
            out[fo + 18 + (i >> 2)] |= c << (2 * (i & 3))
        }
        for (let d = 0; d < DENSE_SIZE; d++) view.setFloat16(fo + 45 + 2 * d, dense[d], true)
        out[fo + 167] = turn
    }

    writeSync(output, out, 0, count * FEAT_BYTES)
    total += count
}
closeSync(input)
closeSync(output)
console.log(`${total} positions en ${((Date.now() - started) / 1000).toFixed(1)} s -> ${OUT}`)
