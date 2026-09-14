import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALL_GRIDS } from '../../app/data/grids/index'
import { makeRng } from '../../engine/dice'
import { CELL_COUNT } from '../../engine/grid'
import { applyMove, cloneSheet } from '../../engine/state'
import { makeGreedyV3Bot, DEFAULT_WEIGHTS_V3 } from '../heuristicV3'
import { playMultiGame } from '../playMulti'
import type { DecisionObservation } from '../playMulti'
import { DENSE_SIZE, denseFeatures, gridInfo, opponentCounts, summarizeOpponents } from '../valueFeatures'
import { ValueNetEvaluator, loadValueNet, makeValueNetBot } from '../valueNet'

/**
 * Le reseau est entraine en Python et execute en TypeScript. Rien d'autre que ce
 * fichier ne verifie que les deux calculent la meme chose : une colonne decalee
 * dans la premiere couche ne ferait planter aucun code, le bot jouerait seulement
 * au hasard avec aplomb.
 *
 * Chemins surchargeables pour verifier un reseau d'essai :
 *   VALUE_NET=training/runs/probe/value-net.json VALUE_NET_PARITY=training/runs/probe/parity.json
 */
const NET = process.env.VALUE_NET ?? 'public/data/value-net.json'
const PARITY = process.env.VALUE_NET_PARITY ?? 'bots/__tests__/fixtures/value-net-parity.json'

function observeGame(seed: number, grid = 0): DecisionObservation[] {
    const seen: DecisionObservation[] = []
    const bots = [0, 1, 2, 3].map(i => makeGreedyV3Bot(DEFAULT_WEIGHTS_V3, `v3-${i}`))
    playMultiGame(ALL_GRIDS[grid].cells, bots, makeRng(seed), { observe: o => seen.push(o) })
    return seen
}

describe('entrees du reseau de valeur', () => {
    /**
     * `legalMoves` fusionne les paires de des equivalentes pour le joueur. Ce qui
     * reste doit donner des entrees distinctes, sinon le bot ne peut pas departager
     * les coups qu'il compare.
     */
    it('distingue chaque coup candidat d une meme decision', () => {
        let decisions = 0
        for (const o of observeGame(424242)) {
            if (o.candidates.length < 3) continue
            const me = o.players[o.seat]
            const keys = new Set(o.candidates.map(m => {
                const s = cloneSheet(me.sheet)
                if (m) applyMove(s, m)
                return `${s.mask.join('')}|${s.jokersUsed}`
            }))
            expect(keys.size).toBe(o.candidates.length)
            decisions++
        }
        expect(decisions).toBeGreaterThan(20)
    })

    it('reste dans des bornes raisonnables tout au long d une partie', () => {
        const out = new Float64Array(DENSE_SIZE)
        for (const o of observeGame(777, 3)) {
            const info = gridInfo(ALL_GRIDS[3].cells)
            const others = o.players.filter((_, i) => i !== o.seat).map(p => p.sheet.mask)
            const me = o.players[o.seat].sheet
            denseFeatures(info, me.mask, me.jokersUsed, summarizeOpponents(info, others), o.turn, false, 8, out)
            for (let d = 0; d < DENSE_SIZE; d++) {
                expect(Number.isFinite(out[d]), `entree ${d}`).toBe(true)
                expect(out[d], `entree ${d}`).toBeGreaterThanOrEqual(0)
                expect(out[d], `entree ${d}`).toBeLessThanOrEqual(2)
            }
        }
    })
})

describe.skipIf(!existsSync(NET) || !existsSync(PARITY))('parite TypeScript / PyTorch', () => {
    it('retrouve les sorties de PyTorch sur les positions exportees', () => {
        const net = loadValueNet(JSON.parse(readFileSync(NET, 'utf8')))
        const parity = JSON.parse(readFileSync(PARITY, 'utf8'))
        const evaluator = new ValueNetEvaluator(net)
        const mask = new Uint8Array(CELL_COUNT)
        const counts = new Uint8Array(CELL_COUNT)

        parity.expected.forEach((expected: number[], r: number) => {
            const bytes: number[] = parity.mask[r]
            const opp: number[] = parity.opp[r]
            for (let i = 0; i < CELL_COUNT; i++) {
                mask[i] = (bytes[i >> 3] >> (i & 7)) & 1
                counts[i] = (opp[i >> 2] >> (2 * (i & 3))) & 3
            }
            evaluator.accumulate(gridInfo(ALL_GRIDS[parity.grid[r]].cells), mask, counts, parity.n[r] - 1)
            const got = evaluator.finish(parity.dense[r])
            expected.forEach((v, k) => expect(got[k]).toBeCloseTo(v, 2))
        })
    })

    it('joue une partie complete sans coup illegal ni plantage', () => {
        const net = loadValueNet(JSON.parse(readFileSync(NET, 'utf8')))
        const bots = [makeValueNetBot(net), makeGreedyV3Bot(), makeGreedyV3Bot(), makeGreedyV3Bot()]
        const r = playMultiGame(ALL_GRIDS[1].cells, bots, makeRng(99))
        expect(r.turns).toBeGreaterThan(5)
        expect(Number.isFinite(r.scores[0])).toBe(true)
    })
})

// Garde le lien avec les compteurs adverses exportes par la preparation des donnees.
void opponentCounts
