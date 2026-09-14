/**
 * Format commun des positions ecrites pour le reseau de valeur, et panel de
 * joueurs qui les produit. Partage par `gen-dataset.ts` (issue de partie) et
 * `gen-rollouts.ts` (deroulements apparies) : un seul encodeur, lu par
 * `featurize.ts`.
 *
 * Enregistrement brut de 96 octets :
 *   0     u8   grille, 1 u8 tour, 2 u8 joueurs, 3 u8 drapeaux (1 actif, 2 simultane, 4 passe, 8 force)
 *   4     4 x 21 octets par siege, slot 0 = le joueur qui decide APRES son coup, puis ordre de jeu :
 *              masque 14 o., jokers u8, bonus couleurs u16 (2 bits), bonus colonnes u32 (2 bits)
 *   88    4 x i8 scores finaux (issue de partie ; zero pour les deroulements)
 *   92    u16 nombre de candidats de la decision, 2 octets libres
 */
import { readFileSync } from 'node:fs'
import { CELL_COUNT } from '../../engine/grid'
import { applyMove, cloneSheet } from '../../engine/state'
import { gridStats } from '../../engine/scoring'
import type { ColorKey } from '../../engine/types'
import { makeGreedyBot } from '../../bots/baselines/basic'
import { makeTemperedBot } from '../../bots/difficulty'
import { V3Scorer, makeGreedyV3Bot } from '../../bots/heuristicV3'
import type { WeightsV3 } from '../../bots/heuristicV3'
import { makeV3MoveScorer } from '../../bots/scorers'
import type { DecisionObservation } from '../../bots/playMulti'
import type { Bot, TurnContext } from '../../bots/types'

export const SEATS = 4
export const MASK_BYTES = Math.ceil(CELL_COUNT / 8)
export const SLOT_BYTES = MASK_BYTES + 1 + 2 + 4
export const RECORD_BYTES = 4 + SEATS * SLOT_BYTES + SEATS + 4

const COLORS: ColorKey[] = ['g', 'y', 'b', 'p', 'o']
const bonusCode = (v: 'first' | 'others' | undefined) => (v === 'first' ? 1 : v === 'others' ? 2 : 0)

const load = (p: string) => JSON.parse(readFileSync(p, 'utf8')).tuned
export const loadMultiWeights = (): WeightsV3 => load('public/data/tuned-weights-multi.json')

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

/**
 * Panel heterogene (meme raison que `tune-multi.ts` : n'apprendre que contre
 * v3-multi apprendrait a battre v3-multi) et deux variantes a temperature, pour
 * que les positions ne soient pas toutes celles que v3 choisirait.
 */
export function makePanel(): Bot[] {
    const vMulti = loadMultiWeights()
    const v3h50: WeightsV3 = load('public/data/tuned-weights-v3-h50.json')
    const v1 = load('public/data/tuned-weights.json')
    return [
        makeGreedyV3Bot(vMulti, 'v3-multi'),
        makeTemperedBot(makeV3MoveScorer(vMulti), 0.15, 'v3-multi-T0.15'),
        makeTemperedBot(makeV3MoveScorer(vMulti), 0.35, 'v3-multi-T0.35'),
        makeV3NoPass(v3h50, 'v3-sans-passe'),
        makeGreedyBot(v1, 'greedy-cem'),
        makeGreedyV3Bot({ ...v3h50, jokerValue: 1.5 }, 'v3-joker-1.5'),
    ]
}

/** Ecrit une position dans `buf` a partir de `off`. Slot 0 = le joueur qui decide, apres `obs.played`. */
export function encode(
    buf: Buffer, off: number, gridIndex: number, obs: DecisionObservation, finalScores: number[] | null,
) {
    const n = obs.players.length
    const seat = obs.seat
    const simultaneous = obs.turn < 3
    const isActive = !simultaneous && seat === obs.turn % n
    const passed = obs.played === null
    const forced = obs.candidates.length === 1

    buf[off] = gridIndex
    buf[off + 1] = Math.min(255, obs.turn)
    buf[off + 2] = n
    buf[off + 3] = (isActive ? 1 : 0) | (simultaneous ? 2 : 0) | (passed ? 4 : 0) | (forced ? 8 : 0)

    for (let slot = 0; slot < SEATS; slot++) {
        const base = off + 4 + slot * SLOT_BYTES
        if (slot >= n) continue
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
        const v = finalScores && slot < n ? finalScores[(seat + slot) % n] : 0
        buf.writeInt8(Math.max(-128, Math.min(127, v)), scoresOff + slot)
    }
    buf.writeUInt16LE(Math.min(65535, obs.candidates.length), scoresOff + SEATS)
}
