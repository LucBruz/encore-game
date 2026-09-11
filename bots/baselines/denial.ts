import type { Roll } from '../../engine/dice'
import { gridStats } from '../../engine/scoring'
import type { GridStats } from '../../engine/scoring'
import { legalMoves, legalMovesByDicePair } from '../../engine/state'
import type { Move, Sheet } from '../../engine/state'
import type { Cells } from '../../engine/types'
import { V3Scorer } from '../heuristicV3'
import type { WeightsV3 } from '../heuristicV3'
import type { Bot, TurnContext } from '../types'

/**
 * Agent conscient du DENI DE DES — EXPERIENCE, non utilise par le jeu.
 *
 * Le gain est reel et mesure (voir plus bas), mais l'integration a ete ecartee :
 * lire les feuilles adverses complique nettement le code du bot en jeu, et un
 * adversaire plus fort n'etait pas l'objectif. Le code reste ici pour que le
 * resultat soit reproductible.
 *
 *
 * La regle : le joueur actif met sa paire de des de cote, les autres ne
 * choisissent que parmi les 4 restants. Son choix a donc deux effets — ce qu'il
 * lui rapporte, et ce qu'il retire aux adversaires. Tous les agents precedents
 * ignorent le second.
 *
 * Deux choses etaient necessaires avant de pouvoir l'exprimer :
 *   - enumerer les coups PAR PAIRE DE DES (legalMovesByDicePair), puisque la
 *     generation normale fusionne les paires equivalentes pour soi et perd donc
 *     l'information pertinente pour autrui ;
 *   - lire les feuilles adverses, ce qui est licite : elles sont publiques.
 *
 * Le terme ajoute est : valeur pour moi − denialWeight × (gain moyen que les 4 des
 * restants offrent aux adversaires). Quand le bot n'est pas actif, il se comporte
 * exactement comme l'agent de base.
 */
export interface DenialOptions {
    weights: WeightsV3
    /** Poids du service rendu aux adversaires. 0 = agent de base. */
    denialWeight: number
    name?: string
}

export function makeDenialBot({ weights, denialWeight, name }: DenialOptions): Bot {
    const cache = new WeakMap<object, GridStats>()
    const statsFor = (cells: Cells): GridStats => {
        const key = cells as unknown as object
        let s = cache.get(key)
        if (!s) { s = gridStats(cells); cache.set(key, s) }
        return s
    }

    /** Meilleur gain d'evaluation qu'un adversaire peut tirer d'un lancer donne. */
    function bestGainFor(
        cells: Cells, sheet: Sheet, roll: Roll, stats: GridStats, totalJokers: number, turn: number,
    ): number {
        const moves = legalMoves(cells, sheet, roll, { totalJokers })
        if (moves.length === 0) return 0
        const sc = new V3Scorer(cells, sheet.mask, sheet.jokersUsed, stats, weights, totalJokers, turn)
        let best = 0 // passer vaut 0 : un adversaire ne se degrade pas volontairement
        for (const m of moves) {
            const gain = sc.scoreAfter(m) - sc.value
            if (gain > best) best = gain
        }
        return best
    }

    return {
        name: name ?? `v3-denial-${denialWeight}`,
        chooseMove(ctx: TurnContext): Move | null {
            const { cells, sheet, moves, totalJokers, turn, isActive, fullRoll, opponents } = ctx
            const stats = statsFor(cells)
            const sc = new V3Scorer(cells, sheet.mask, sheet.jokersUsed, stats, weights, totalJokers, turn)

            // Hors position active, ou sans information adverse : agent de base.
            if (!isActive || !fullRoll || !opponents || opponents.length === 0 || denialWeight === 0) {
                if (moves.length === 0) return null
                let best: Move | null = null
                let bestValue = sc.value
                for (const m of moves) {
                    const v = sc.scoreAfter(m)
                    if (v > bestValue) { bestValue = v; best = m }
                }
                return best
            }

            const candidates = legalMovesByDicePair(cells, sheet, fullRoll, { totalJokers })
            if (candidates.length === 0) return null

            // Le service rendu aux adversaires ne depend que de la PAIRE DE DES
            // retiree, pas de l'endroit ou l'on coche : on le calcule une fois par
            // paire au lieu d'une fois par placement.
            const denialCache = new Map<string, number>()
            const denialFor = (ci: number, ni: number): number => {
                const key = `${ci},${ni}`
                const known = denialCache.get(key)
                if (known !== undefined) return known
                const left: Roll = {
                    colors: fullRoll.colors.filter((_, i) => i !== ci),
                    numbers: fullRoll.numbers.filter((_, i) => i !== ni),
                }
                let sum = 0
                for (const opp of opponents) sum += bestGainFor(cells, opp, left, stats, totalJokers, turn)
                const mean = sum / opponents.length
                denialCache.set(key, mean)
                return mean
            }

            // Passer laisse les 6 des : on value cette option avec le meme terme.
            let best: Move | null = null
            let bestValue = sc.value - denialWeight * (() => {
                let sum = 0
                for (const opp of opponents) sum += bestGainFor(cells, opp, fullRoll, stats, totalJokers, turn)
                return sum / opponents.length
            })()

            for (const m of candidates) {
                const v = sc.scoreAfter(m) - denialWeight * denialFor(m.colorDieIndex, m.numberDieIndex)
                if (v > bestValue) { bestValue = v; best = m }
            }
            return best
        },
    }
}
