import { gridStats } from '../engine/scoring'
import type { GridStats } from '../engine/scoring'
import type { Cells } from '../engine/types'
import { DEFAULT_WEIGHTS_V3, V3Scorer } from './heuristicV3'
import type { WeightsV3 } from './heuristicV3'
import type { MoveScorer } from './difficulty'
import type { TurnContext } from './types'

/** Valeurs de tous les coups candidats selon l'heuristique v3 (forme + timing). */
export function makeV3MoveScorer(weights: WeightsV3 = DEFAULT_WEIGHTS_V3): MoveScorer {
    const cache = new WeakMap<object, GridStats>()
    const statsFor = (cells: Cells): GridStats => {
        const key = cells as unknown as object
        let s = cache.get(key)
        if (!s) { s = gridStats(cells); cache.set(key, s) }
        return s
    }

    return ({ cells, sheet, moves, totalJokers, turn }: TurnContext) => {
        const scorer = new V3Scorer(
            cells, sheet.mask, sheet.jokersUsed, statsFor(cells), weights, totalJokers, turn,
        )
        return {
            moves: moves.map(move => ({ move, value: scorer.scoreAfter(move) })),
            passValue: scorer.value,
        }
    }
}
