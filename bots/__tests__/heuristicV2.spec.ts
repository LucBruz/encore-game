import { describe, expect, it } from 'vitest'
import { ALL_GRIDS } from '../../app/data/grids/index'
import { makeRng, rollDice } from '../../engine/dice'
import { CELL_COUNT } from '../../engine/grid'
import { createMask } from '../../engine/mask'
import { applyMove, cloneSheet, createSheet, legalMoves } from '../../engine/state'
import { gridStats } from '../heuristic'
import { DEFAULT_WEIGHTS_V2, V2Scorer, evaluateV2, vecToWeightsV2, weightsV2ToVec } from '../heuristicV2'

/**
 * L'evaluation v2 est incrementale : le scorer agrege l'etat une fois par tour,
 * puis chaque coup candidat est value par delta local. Un bug dans ce delta
 * fausserait silencieusement toute l'optimisation, donc il est compare a un
 * recalcul complet sur des positions aleatoires.
 */
describe('V2Scorer — le delta incremental egale le recalcul complet', () => {
    it('coincide sur des positions et des coups aleatoires', () => {
        const rng = makeRng(0x1234abcd)
        let compared = 0

        for (let iter = 0; iter < 300; iter++) {
            const grid = ALL_GRIDS[iter % ALL_GRIDS.length]
            const cells = grid.cells
            const stats = gridStats(cells)

            // Poids aleatoires, y compris negatifs : le delta doit tenir pour tous.
            const w = vecToWeightsV2(
                weightsV2ToVec(DEFAULT_WEIGHTS_V2).map(() => (rng() - 0.3) * 6),
            )

            const sheet = createSheet()
            sheet.mask = createMask()
            const density = rng() * 0.6
            for (let i = 0; i < CELL_COUNT; i++) if (rng() < density) sheet.mask[i] = 1
            sheet.jokersUsed = Math.floor(rng() * 6)

            const roll = rollDice(rng)
            const moves = legalMoves(cells, sheet, roll)
            if (moves.length === 0) continue

            const scorer = new V2Scorer(cells, sheet.mask, sheet.jokersUsed, stats, w, 8)

            for (const move of moves.slice(0, 12)) {
                const incremental = scorer.scoreAfter(move)

                const after = cloneSheet(sheet)
                applyMove(after, move)
                const full = evaluateV2(cells, after.mask, after.jokersUsed, stats, w, 8)

                expect(incremental).toBeCloseTo(full, 9)
                compared++
            }
        }

        expect(compared).toBeGreaterThan(500)
    })

    it('ne mute pas le masque de la feuille', () => {
        const grid = ALL_GRIDS[0]
        const sheet = createSheet()
        const scorer = new V2Scorer(grid.cells, sheet.mask, 0, gridStats(grid.cells), DEFAULT_WEIGHTS_V2, 8)
        const moves = legalMoves(grid.cells, sheet, { colors: ['g', 'y', 'b'], numbers: [1, 2, 3] })
        const before = [...sheet.mask]
        for (const m of moves) scorer.scoreAfter(m)
        expect([...sheet.mask]).toEqual(before)
    })
})
