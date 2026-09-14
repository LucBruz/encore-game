/**
 * Donnees d'auto-jeu pour le reseau de valeur.
 *
 *   npx tsx scripts/gen-dataset.ts --games 100 --out training/data/probe.bin
 *   npx tsx scripts/gen-dataset.ts --games 20000 --shard 3 --shards 10 --out training/data/train-3.bin
 *
 * Chaque enregistrement est une position APRES le coup d'un joueur (son
 * « afterstate »), etiquetee par le score final reel de chaque siege. Un bot a
 * 1 coup d'avance evalue exactement ces positions-la : pour chaque coup legal, la
 * feuille qu'il laisse. Le reseau apprend donc ce que vaut une feuille pour la
 * suite de la partie, sous la politique des joueurs de la table.
 *
 * Table de 4, vraie regle (`playMulti`), 8 grilles, sieges en rotation.
 *
 * Panel volontairement heterogene (meme raison que `tune-multi.ts` : n'apprendre
 * que contre v3-multi apprendrait a battre v3-multi) et deux variantes a
 * temperature : sans exploration, le reseau ne verrait que les feuilles que v3
 * choisit, puis devrait juger en jeu des feuilles qu'il n'a jamais vues.
 *
 * GRAINES RESERVEES — ne pas reutiliser ailleurs :
 *   entrainement  5150000 + g * 7919
 *   evaluation    5250000 + g * 7919  (duel du reseau, jamais vu a l'entrainement)
 * 100000 n'est pas un multiple de 7919 : les deux suites ne se croisent pas.
 * `duel.ts` utilise 31415, `tune-multi.ts` 707070 et 246813.
 */
import { mkdirSync, openSync, readFileSync, writeSync, closeSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { CELL_COUNT } from '../engine/grid'
import { applyMove, cloneSheet } from '../engine/state'
import type { ColorKey } from '../engine/types'
import { makeGreedyBot } from '../bots/baselines/basic'
import { makeTemperedBot } from '../bots/difficulty'
import { makeGreedyV3Bot, V3Scorer } from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { gridStats } from '../engine/scoring'
import { makeV3MoveScorer } from '../bots/scorers'
import { playMultiGame } from '../bots/playMulti'
import type { DecisionObservation } from '../bots/playMulti'
import type { Bot, TurnContext } from '../bots/types'
import type { Cells } from '../engine/types'

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

export const SEATS = 4
const MASK_BYTES = Math.ceil(CELL_COUNT / 8) // 14
const SLOT_BYTES = MASK_BYTES + 1 + 2 + 4     // masque, jokers, bonus couleurs, bonus colonnes
export const RECORD_BYTES = 4 + SEATS * SLOT_BYTES + SEATS + 4 // = 96

const COLORS: ColorKey[] = ['g', 'y', 'b', 'p', 'o']
const bonusCode = (v: 'first' | 'others' | undefined) => (v === 'first' ? 1 : v === 'others' ? 2 : 0)

const load = (p: string) => JSON.parse(readFileSync(p, 'utf8')).tuned
const vMulti: WeightsV3 = load('public/data/tuned-weights-multi.json')
const v3h50: WeightsV3 = load('public/data/tuned-weights-v3-h50.json')
const v1 = load('public/data/tuned-weights.json')

function makeV3NoPass(w: WeightsV3, name: string): Bot {
    const stats = new WeakMap<object, ReturnType<typeof gridStats>>()
    return {
        name,
        chooseMove({ cells, sheet, moves, totalJokers, turn }: TurnContext) {
            if (moves.length === 0) return null
            const k = cells as unknown as object
            let s = stats.get(k); if (!s) { s = gridStats(cells); stats.set(k, s) }
            const sc = new V3Scorer(cells, sheet.mask, sheet.jokersUsed, s, w, totalJokers, turn)
            let best = moves[0], bestV = -Infinity
            for (const m of moves) { const v = sc.scoreAfter(m); if (v > bestV) { bestV = v; best = m } }
            return best
        },
    }
}

const PANEL: Bot[] = [
    makeGreedyV3Bot(vMulti, 'v3-multi'),
    makeTemperedBot(makeV3MoveScorer(vMulti), 0.15, 'v3-multi-T0.15'),
    makeTemperedBot(makeV3MoveScorer(vMulti), 0.35, 'v3-multi-T0.35'),
    makeV3NoPass(v3h50, 'v3-sans-passe'),
    makeGreedyBot(v1, 'greedy-cem'),
    makeGreedyV3Bot({ ...v3h50, jokerValue: 1.5 }, 'v3-joker-1.5'),
]

/** Ecrit une position dans `buf` a partir de `off`. Slot 0 = le joueur qui decide, puis ordre de jeu. */
function encode(
    buf: Buffer, off: number, gridIndex: number, obs: DecisionObservation, finalScores: number[],
) {
    const n = obs.players.length
    const seat = obs.seat
    const simultaneous = obs.turn < 3
    const isActive = !simultaneous && seat === obs.turn % n
    const passed = obs.played === null
    const forced = obs.candidates.length === 1 // seul `null` : aucun coup legal

    buf[off] = gridIndex
    buf[off + 1] = Math.min(255, obs.turn)
    buf[off + 2] = n
    buf[off + 3] = (isActive ? 1 : 0) | (simultaneous ? 2 : 0) | (passed ? 4 : 0) | (forced ? 8 : 0)

    for (let slot = 0; slot < SEATS; slot++) {
        const base = off + 4 + slot * SLOT_BYTES
        if (slot >= n) continue // table plus petite : slot laisse a zero
        const p = obs.players[(seat + slot) % n]
        let sheet = p.sheet
        if (slot === 0 && obs.played) {
            sheet = cloneSheet(p.sheet)
            applyMove(sheet, obs.played)
        }
        for (let i = 0; i < CELL_COUNT; i++) if (sheet.mask[i]) buf[base + (i >> 3)] |= 1 << (i & 7)
        buf[base + MASK_BYTES] = sheet.jokersUsed
        let colors = 0
        COLORS.forEach((c, ci) => { colors |= bonusCode(p.colorBonus[c]) << (2 * ci) })
        buf.writeUInt16LE(colors, base + MASK_BYTES + 1)
        let columns = 0
        for (let col = 0; col < 15; col++) columns += bonusCode(p.columnBonus[col]) * 2 ** (2 * col)
        buf.writeUInt32LE(columns >>> 0, base + MASK_BYTES + 3)
    }

    const scoresOff = off + 4 + SEATS * SLOT_BYTES
    for (let slot = 0; slot < SEATS; slot++) {
        buf.writeInt8(slot < n ? Math.max(-128, Math.min(127, finalScores[(seat + slot) % n])) : 0, scoresOff + slot)
    }
    buf.writeUInt16LE(Math.min(65535, obs.candidates.length), scoresOff + SEATS)
}

function main() {
    mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true })
    const fd = openSync(OUT, 'w')
    const started = Date.now()
    let records = 0
    let turns = 0

    // Partage en tranches : la tranche k joue les parties g = k, k + SHARDS, ...
    // Des processus paralleles ecrivent donc des parties disjointes.
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
}

main()
