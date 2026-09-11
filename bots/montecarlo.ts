import { makeRng, rollDice } from '../engine/dice'
import { scoreSheet } from '../engine/scoring'
import type { BonusMode } from '../engine/scoring'
import { applyMove, cloneSheet, isGameOver, legalMoves } from '../engine/state'
import type { Move, Sheet } from '../engine/state'
import type { Cells } from '../engine/types'
import { DEFAULT_WEIGHTS, evaluateSheet, gridStats } from './heuristic'
import type { GridStats, HeuristicWeights } from './heuristic'
import { makeGreedyBot } from './basic'
import type { Bot, TurnContext } from './types'

export interface MonteCarloOptions {
    /** Coups candidats retenus, classes par heuristique. Borne le cout. */
    topK?: number
    /** Deroulements par candidat. */
    rollouts?: number
    maxTurns?: number
    mode?: BonusMode
    seed?: number
    /** Poids utilises pour la preselection ET pour la politique de deroulement. */
    weights?: HeuristicWeights
    name?: string
}

/**
 * Sonde de plafond : pour chaque coup candidat, on joue la partie jusqu'au bout
 * avec le bot glouton et des des aleatoires, puis on garde le coup dont le score
 * final moyen est le meilleur.
 *
 * Ce n'est pas un agent destine a tourner dans le navigateur — c'est la mesure
 * qui dit s'il reste de la marge au-dessus du glouton, donc si un modele appris
 * a quelque chose a demontrer.
 */
export function makeMonteCarloBot(opts: MonteCarloOptions = {}): Bot {
    const topK = opts.topK ?? 6
    const rollouts = opts.rollouts ?? 6
    const maxTurns = opts.maxTurns ?? 50
    const mode = opts.mode ?? 'average'
    let rolloutSeed = opts.seed ?? 1
    const weights = opts.weights ?? DEFAULT_WEIGHTS
    const rolloutBot = makeGreedyBot(weights)

    const statsCache = new WeakMap<object, GridStats>()
    const statsFor = (cells: Cells): GridStats => {
        const key = cells as unknown as object
        let s = statsCache.get(key)
        if (!s) { s = gridStats(cells); statsCache.set(key, s) }
        return s
    }

    function rollout(cells: Cells, start: Sheet, fromTurn: number, totalJokers: number, seed: number): number {
        const sheet = cloneSheet(start)
        const rng = makeRng(seed)
        for (let turn = fromTurn; turn < maxTurns; turn++) {
            if (isGameOver(cells, sheet)) break
            const roll = rollDice(rng)
            const moves = legalMoves(cells, sheet, roll, { totalJokers })
            const move = rolloutBot.chooseMove({ cells, sheet, moves, turn, totalJokers, rng })
            if (move) applyMove(sheet, move)
        }
        return scoreSheet(cells, sheet.mask, sheet.jokersUsed, { gameOver: true, mode, totalJokers }).total
    }

    return {
        name: opts.name ?? 'montecarlo',
        chooseMove({ cells, sheet, moves, turn, totalJokers }: TurnContext): Move | null {
            if (moves.length === 0) return null
            if (moves.length === 1) return moves[0]

            const stats = statsFor(cells)
            const mask = sheet.mask

            // Presélection heuristique : evaluer tous les coups par deroulement
            // serait inutilement couteux, la plupart sont clairement mauvais.
            const ranked = moves.map(move => {
                for (const idx of move.placement) mask[idx] = 1
                const value = evaluateSheet(
                    cells, mask, sheet.jokersUsed + move.jokersSpent, stats, weights, totalJokers,
                )
                for (const idx of move.placement) mask[idx] = 0
                return { move, value }
            }).sort((a, b) => b.value - a.value).slice(0, topK)

            let best: Move | null = null
            let bestMean = -Infinity

            for (const { move } of ranked) {
                const after = cloneSheet(sheet)
                applyMove(after, move)

                let sum = 0
                for (let r = 0; r < rollouts; r++) {
                    // Meme suite de des pour tous les candidats d'un meme tour :
                    // la comparaison est appariee, le bruit commun s'annule.
                    sum += rollout(cells, after, turn + 1, totalJokers, rolloutSeed + r * 104729)
                }
                const mean = sum / rollouts
                if (mean > bestMean) { bestMean = mean; best = move }
            }

            rolloutSeed += 7919
            return best
        },
    }
}

export const monteCarloBot = makeMonteCarloBot()
