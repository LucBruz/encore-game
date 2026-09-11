import type { Move } from '../engine/state'
import { DEFAULT_WEIGHTS, evaluateSheet, gridStats } from './heuristic'
import type { GridStats, HeuristicWeights } from './heuristic'
import type { Bot, TurnContext } from './types'
import type { Cells } from '../engine/types'

/** Coup legal tire au hasard. Plancher de reference. */
export const randomBot: Bot = {
    name: 'random',
    chooseMove({ moves, rng }: TurnContext): Move | null {
        if (moves.length === 0) return null
        return moves[Math.floor(rng() * moves.length)]
    },
}

/**
 * Glouton 1 ply : applique chaque coup et garde celui qui maximise l'heuristique.
 * Ne passe jamais volontairement — sur une feuille solo, cocher est presque
 * toujours preferable, sauf cout en jokers, deja pris en compte par l'evaluation.
 */
export function makeGreedyBot(
    weights: HeuristicWeights = DEFAULT_WEIGHTS,
    name = 'greedy',
): Bot {
    const statsCache = new WeakMap<object, GridStats>()

    const statsFor = (cells: Cells): GridStats => {
        const key = cells as unknown as object
        let s = statsCache.get(key)
        if (!s) { s = gridStats(cells); statsCache.set(key, s) }
        return s
    }

    return {
        name,
        chooseMove({ cells, sheet, moves, totalJokers }: TurnContext): Move | null {
            if (moves.length === 0) return null
            const stats = statsFor(cells)

            // Masque de travail reutilise : on pose le coup, on evalue, on le retire.
            const mask = sheet.mask
            let best: Move | null = null
            let bestValue = -Infinity

            for (const move of moves) {
                for (const idx of move.placement) mask[idx] = 1
                const value = evaluateSheet(
                    cells, mask, sheet.jokersUsed + move.jokersSpent, stats, weights, totalJokers,
                )
                for (const idx of move.placement) mask[idx] = 0
                if (value > bestValue) { bestValue = value; best = move }
            }

            return best
        },
    }
}

export const greedyBot = makeGreedyBot()
