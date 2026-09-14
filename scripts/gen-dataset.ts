/**
 * Donnees d'auto-jeu pour le reseau de valeur : issue de partie.
 *
 *   npx tsx scripts/gen-dataset.ts --games 100 --out training/data/probe.bin
 *   npx tsx scripts/gen-dataset.ts --games 10000 --shard 3 --shards 10 --out training/data/train-3.bin
 *
 * Chaque enregistrement est une position APRES le coup d'un joueur (son
 * « afterstate »), etiquetee par le score final reel de chaque siege. Format dans
 * `scripts/lib/valueData.ts`.
 *
 * Table de 4, vraie regle (`playMulti`), 8 grilles, sieges en rotation, panel
 * heterogene (`makePanel`).
 *
 * Mesure faite (voir CLAUDE.md) : un reseau entraine sur ces donnees predit bien
 * le score mais JOUE moins bien que v3-multi. Les donnees de
 * `gen-rollouts.ts` corrigent la cause.
 *
 * GRAINES RESERVEES — ne pas reutiliser ailleurs :
 *   issue de partie   5150000 + g * 7919   (ce script)
 *   evaluation        5250000 + g * 7919   (duel des reseaux, jamais vu a l'entrainement)
 *   deroulements      5350000 + g * 7919   (positions de `gen-rollouts.ts`)
 * Les ecarts (100000, 200000) ne sont pas multiples de 7919 : les suites ne se croisent pas.
 * `duel.ts` utilise 31415, `tune-multi.ts` 707070 et 246813.
 */
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import type { Cells } from '../engine/types'
import { playMultiGame } from '../bots/playMulti'
import type { DecisionObservation } from '../bots/playMulti'
import { RECORD_BYTES, SEATS, encode, makePanel } from './lib/valueData'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const GAMES = Number(arg('games', '100'))
const SEED = Number(arg('seed', '5150000'))
const SHARD = Number(arg('shard', '0'))
const SHARDS = Number(arg('shards', '1'))
const MAX_TURNS = Number(arg('maxTurns', '60'))
const OUT = arg('out', 'training/data/probe.bin')

const PANEL = makePanel()

mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true })
const fd = openSync(OUT, 'w')
const started = Date.now()
let records = 0
let turns = 0

// Partage en tranches : la tranche k joue les parties g = k, k + SHARDS, ...
for (let local = 0; local < GAMES; local++) {
    const g = SHARD + local * SHARDS
    const gridIndex = g % ALL_GRIDS.length
    const cells: Cells = ALL_GRIDS[gridIndex].cells
    const seating = Array.from({ length: SEATS }, (_, s) => PANEL[(g + s) % PANEL.length])

    const seen: DecisionObservation[] = []
    const result = playMultiGame(cells, seating, makeRng(SEED + g * 7919), {
        maxTurns: MAX_TURNS,
        observe: o => seen.push(o),
    })
    turns += result.turns

    const buf = Buffer.alloc(seen.length * RECORD_BYTES)
    seen.forEach((o, k) => encode(buf, k * RECORD_BYTES, gridIndex, o, result.scores))
    writeSync(fd, buf)
    records += seen.length

    if ((local + 1) % 500 === 0) {
        const s = (Date.now() - started) / 1000
        console.log(`  ${local + 1}/${GAMES} parties, ${records} positions, ${(s / (local + 1) * 1000).toFixed(1)} ms/partie`)
    }
}
closeSync(fd)

const s = (Date.now() - started) / 1000
console.log(
    `${GAMES} parties (tranche ${SHARD}/${SHARDS}) en ${s.toFixed(1)} s — ${(s / GAMES * 1000).toFixed(1)} ms/partie, `
    + `${records} positions (${(records / GAMES).toFixed(1)}/partie), ${(turns / GAMES).toFixed(1)} tours/partie -> ${OUT}`,
)
