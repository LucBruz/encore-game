import { makeRng, rollDice } from '../../engine/dice'
import type { Roll } from '../../engine/dice'
import { applyMove, cloneSheet, isGameOver, legalMoves } from '../../engine/state'
import type { Move, Sheet } from '../../engine/state'
import type { Cells } from '../../engine/types'
import { DEFAULT_WEIGHTS, evaluateSheet, gridStats } from './heuristic'
import type { GridStats, HeuristicWeights } from './heuristic'
import type { Bot, TurnContext } from '../types'

export interface ExpectimaxOptions {
    weights?: HeuristicWeights
    /** Profondeur en tours. 1 = glouton. 2 = un lancer d'anticipation. */
    depth?: number
    /** Coups candidats conserves a chaque noeud, classes par heuristique. */
    topK?: number
    /**
     * Lancers echantillonnes au noeud de hasard. L'enumeration exhaustive des
     * 3136 classes de lancer est exacte mais hors de portee ici ; un echantillon
     * commun a tous les candidats donne une comparaison appariee a cout borne.
     */
    rollSamples?: number
    seed?: number
    name?: string
}

/**
 * Expectimax a profondeur limitee : max sur les coups, moyenne sur les lancers,
 * heuristique aux feuilles. Sert de professeur — il n'est pas destine a tourner
 * dans le navigateur.
 */
export function makeExpectimaxBot(opts: ExpectimaxOptions = {}): Bot {
    const weights = opts.weights ?? DEFAULT_WEIGHTS
    const depth = opts.depth ?? 2
    const topK = opts.topK ?? 10
    const rollSamples = opts.rollSamples ?? 24
    const baseSeed = opts.seed ?? 13
    const name = opts.name ?? `expectimax-d${depth}`

    const statsCache = new WeakMap<object, GridStats>()
    const statsFor = (cells: Cells): GridStats => {
        const key = cells as unknown as object
        let s = statsCache.get(key)
        if (!s) { s = gridStats(cells); statsCache.set(key, s) }
        return s
    }

    function leafValue(cells: Cells, sheet: Sheet, stats: GridStats, totalJokers: number): number {
        return evaluateSheet(cells, sheet.mask, sheet.jokersUsed, stats, weights, totalJokers)
    }

    /** Meilleure valeur atteignable depuis `sheet` avec ce lancer, a la profondeur donnee. */
    function maxNode(
        cells: Cells, sheet: Sheet, roll: Roll, d: number,
        stats: GridStats, totalJokers: number, rolls: Roll[],
    ): number {
        const moves = legalMoves(cells, sheet, roll, { totalJokers })
        if (moves.length === 0) {
            // Passer : la feuille ne change pas, mais le tour est consomme.
            return d <= 1
                ? leafValue(cells, sheet, stats, totalJokers)
                : chanceNode(cells, sheet, d - 1, stats, totalJokers, rolls)
        }

        const mask = sheet.mask
        const ranked = moves.map(move => {
            for (const idx of move.placement) mask[idx] = 1
            const v = evaluateSheet(cells, mask, sheet.jokersUsed + move.jokersSpent, stats, weights, totalJokers)
            for (const idx of move.placement) mask[idx] = 0
            return { move, v }
        })

        if (d <= 1) {
            let best = -Infinity
            for (const r of ranked) if (r.v > best) best = r.v
            return best
        }

        ranked.sort((a, b) => b.v - a.v)
        let best = -Infinity
        for (const { move } of ranked.slice(0, topK)) {
            const after = cloneSheet(sheet)
            applyMove(after, move)
            const v = isGameOver(cells, after)
                ? leafValue(cells, after, stats, totalJokers)
                : chanceNode(cells, after, d - 1, stats, totalJokers, rolls)
            if (v > best) best = v
        }
        return best
    }

    /** Moyenne sur les lancers echantillonnes. */
    function chanceNode(
        cells: Cells, sheet: Sheet, d: number,
        stats: GridStats, totalJokers: number, rolls: Roll[],
    ): number {
        let sum = 0
        for (const roll of rolls) sum += maxNode(cells, sheet, roll, d, stats, totalJokers, rolls)
        return sum / rolls.length
    }

    let callCount = 0

    return {
        name,
        chooseMove({ cells, sheet, moves, totalJokers }: TurnContext): Move | null {
            if (moves.length === 0) return null
            if (moves.length === 1) return moves[0]

            const stats = statsFor(cells)
            const mask = sheet.mask

            const ranked = moves.map(move => {
                for (const idx of move.placement) mask[idx] = 1
                const v = evaluateSheet(cells, mask, sheet.jokersUsed + move.jokersSpent, stats, weights, totalJokers)
                for (const idx of move.placement) mask[idx] = 0
                return { move, v }
            }).sort((a, b) => b.v - a.v)

            if (depth <= 1) return ranked[0].move

            // Un seul echantillon de lancers, partage par tous les candidats du tour :
            // le bruit du noeud de hasard est commun, donc il ne biaise pas le classement.
            const rng = makeRng(baseSeed + callCount++ * 7919)
            const rolls: Roll[] = Array.from({ length: rollSamples }, () => rollDice(rng))

            let best: Move | null = null
            let bestValue = -Infinity
            for (const { move } of ranked.slice(0, topK)) {
                const after = cloneSheet(sheet)
                applyMove(after, move)
                const v = isGameOver(cells, after)
                    ? leafValue(cells, after, stats, totalJokers)
                    : chanceNode(cells, after, depth - 1, stats, totalJokers, rolls)
                if (v > bestValue) { bestValue = v; best = move }
            }
            return best
        },
    }
}
