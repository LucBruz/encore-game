import type { Cells } from '../engine/types'
import { DEFAULT_WEIGHTS, evaluateSheet, gridStats } from './heuristic'
import type { GridStats, HeuristicWeights } from './heuristic'
import { DEFAULT_WEIGHTS_V3, V3Scorer } from './heuristicV3'
import type { WeightsV3 } from './heuristicV3'
import type { MoveScorer } from './difficulty'
import type { TurnContext } from './types'

function statsCacheFor() {
    const cache = new WeakMap<object, GridStats>()
    return (cells: Cells): GridStats => {
        const key = cells as unknown as object
        let s = cache.get(key)
        if (!s) { s = gridStats(cells); cache.set(key, s) }
        return s
    }
}

/** Valeurs de tous les coups candidats selon l'heuristique v1. */
export function makeV1MoveScorer(weights: HeuristicWeights = DEFAULT_WEIGHTS): MoveScorer {
    const statsFor = statsCacheFor()
    return ({ cells, sheet, moves, totalJokers }: TurnContext) => {
        const stats = statsFor(cells)
        const mask = sheet.mask
        return moves.map(move => {
            for (const idx of move.placement) mask[idx] = 1
            const value = evaluateSheet(
                cells, mask, sheet.jokersUsed + move.jokersSpent, stats, weights, totalJokers,
            )
            for (const idx of move.placement) mask[idx] = 0
            return { move, value }
        })
    }
}

/** Valeurs de tous les coups candidats selon l'heuristique v3 (forme + timing). */
export function makeV3MoveScorer(weights: WeightsV3 = DEFAULT_WEIGHTS_V3): MoveScorer {
    const statsFor = statsCacheFor()
    return ({ cells, sheet, moves, totalJokers, turn }: TurnContext) => {
        const scorer = new V3Scorer(
            cells, sheet.mask, sheet.jokersUsed, statsFor(cells), weights, totalJokers, turn,
        )
        return moves.map(move => ({ move, value: scorer.scoreAfter(move) }))
    }
}
