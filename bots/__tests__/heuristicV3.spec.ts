import { describe, expect, it } from 'vitest'
import { ALL_GRIDS } from '../../app/data/grids/index'
import { makeRng, rollDice } from '../../engine/dice'
import { CELL_COUNT, NEIGHBORS } from '../../engine/grid'
import { createMask } from '../../engine/mask'
import { applyMove, cloneSheet, createSheet, legalMoves } from '../../engine/state'
import { gridStats } from '../../engine/scoring'
import {
    DEFAULT_WEIGHTS_V3, V3Scorer, V3_KEYS, vecToWeightsV3, weightsV3ToVec,
} from '../heuristicV3'

/** Reference independante : composantes de taille 1 et 2 par parcours direct. */
function countSmallComponentsRef(cells: any, mask: Uint8Array) {
    const seen = new Uint8Array(CELL_COUNT)
    let ones = 0
    let twos = 0
    for (let i = 0; i < CELL_COUNT; i++) {
        if (seen[i] || mask[i]) continue
        const color = cells[i][0]
        const stack = [i]
        seen[i] = 1
        let size = 0
        while (stack.length) {
            const cur = stack.pop()!
            size++
            for (const u of NEIGHBORS[cur]) {
                if (seen[u] || mask[u] || cells[u][0] !== color) continue
                seen[u] = 1
                stack.push(u)
            }
        }
        if (size === 1) ones++
        else if (size === 2) twos++
    }
    return { ones, twos }
}

describe('V3Scorer — le delta egale le recalcul complet', () => {
    it('coincide sur des positions, des coups et des tours aleatoires', () => {
        const rng = makeRng(0x51af00d)
        let compared = 0

        for (let iter = 0; iter < 250; iter++) {
            const grid = ALL_GRIDS[iter % ALL_GRIDS.length]
            const cells = grid.cells
            const stats = gridStats(cells)

            // Les poids sont tires dans le domaine que le tuner autorise. Un exposant
            // negatif donnerait 0^negatif = Infinity sur une couleur ou une colonne
            // vide : hors domaine, et le tuner ne peut pas y aller (bornes positives).
            const w = vecToWeightsV3(
                weightsV3ToVec(DEFAULT_WEIGHTS_V3).map((_, i) => {
                    const k = V3_KEYS[i]
                    if (k === 'earlyHorizon' || k === 'lateHorizon') return 1 + rng() * 30
                    if (k === 'columnExponent' || k === 'colorExponent') return 0.2 + rng() * 5
                    return (rng() - 0.3) * 6
                }),
            )

            const sheet = createSheet()
            sheet.mask = createMask()
            const density = rng() * 0.6
            for (let i = 0; i < CELL_COUNT; i++) if (rng() < density) sheet.mask[i] = 1
            sheet.jokersUsed = Math.floor(rng() * 6)

            const turn = Math.floor(rng() * 40)
            const moves = legalMoves(cells, sheet, rollDice(rng))
            if (moves.length === 0) continue

            const scorer = new V3Scorer(cells, sheet.mask, sheet.jokersUsed, stats, w, 8, turn)

            for (const move of moves.slice(0, 10)) {
                const incremental = scorer.scoreAfter(move)

                const after = cloneSheet(sheet)
                applyMove(after, move)
                const full = new V3Scorer(
                    cells, after.mask, after.jokersUsed, stats, w, 8, turn,
                ).value

                expect(incremental).toBeCloseTo(full, 9)
                compared++
            }
        }

        expect(compared).toBeGreaterThan(400)
    })

    it('compte les composantes isolees comme une reference independante', () => {
        const rng = makeRng(777)
        for (let iter = 0; iter < 60; iter++) {
            const grid = ALL_GRIDS[iter % ALL_GRIDS.length]
            const stats = gridStats(grid.cells)
            const mask = createMask()
            for (let i = 0; i < CELL_COUNT; i++) if (rng() < 0.5) mask[i] = 1

            // Les points de colonne du bareme ne sont pas un poids : ils ne peuvent pas
            // etre annules. On isole donc le terme orphelin par DIFFERENCE entre deux
            // evaluations qui ne different que par orphan1 et orphan2.
            const zero = { ...DEFAULT_WEIGHTS_V3, orphan1: 0, orphan2: 0 }
            const one = { ...DEFAULT_WEIGHTS_V3, orphan1: 1, orphan2: 0 }
            const two = { ...DEFAULT_WEIGHTS_V3, orphan1: 0, orphan2: 1 }

            const v0 = new V3Scorer(grid.cells, mask, 0, stats, zero, 8, 30).value
            const v1 = new V3Scorer(grid.cells, mask, 0, stats, one, 8, 30).value
            const v2 = new V3Scorer(grid.cells, mask, 0, stats, two, 8, 30).value

            const ref = countSmallComponentsRef(grid.cells, mask)
            expect(v0 - v1).toBeCloseTo(ref.ones, 9)
            expect(v0 - v2).toBeCloseTo(ref.twos, 9)
        }
    })

    it('ne mute pas le masque de la feuille', () => {
        const grid = ALL_GRIDS[0]
        const sheet = createSheet()
        const scorer = new V3Scorer(
            grid.cells, sheet.mask, 0, gridStats(grid.cells), DEFAULT_WEIGHTS_V3, 8, 0,
        )
        const moves = legalMoves(grid.cells, sheet, { colors: ['g', 'y', 'b'], numbers: [1, 2, 3] })
        const before = [...sheet.mask]
        for (const m of moves) scorer.scoreAfter(m)
        expect([...sheet.mask]).toEqual(before)
    })
})
