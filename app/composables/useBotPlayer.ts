import { makeGreedyBot } from '~~/bots/basic'
import type { HeuristicWeights } from '~~/bots/heuristic'
import { DEFAULT_WEIGHTS } from '~~/bots/heuristic'
import type { Bot } from '~~/bots/types'
import type { ColorFace, NumberFace, Roll } from '~~/engine/dice'
import { makeRng } from '~~/engine/dice'
import { maskFromSet } from '~~/engine/mask'
import { legalMoves } from '~~/engine/state'
import type { Move } from '~~/engine/state'
import type { useGameStore } from '~/stores/gameStore'
import type { ColorKey } from '~/data/grids/grid-01'

type GameStore = ReturnType<typeof useGameStore>

/** Poids appris par CEM (scripts/tune.ts), copies ici pour eviter un fetch au runtime. */
export const CEM_WEIGHTS: HeuristicWeights = {
    columnExponent: 2.777,
    colorExponent: 0.529,
    colorValue: 1.075,
    starValue: 2.033,
    jokerValue: 3.678,
    cellValue: 0.034,
}

export interface BotDecision {
    colorDiceIndex: number
    numberDiceIndex: number
    jokerColor?: ColorKey
    jokerCount?: number
    placement: number[]
}

/**
 * Traduit l'etat du store en probleme pour le moteur headless, choisit un coup,
 * puis retraduit en indices de des utilisables par les actions du store.
 *
 * Les indices renvoyes sont relatifs a la LISTE DE DES FOURNIE. Pour un joueur
 * passif, cette liste est `availableForPassive`, deja amputee du choix du joueur
 * actif — c'est bien cette indexation qu'attendent `confirmPassiveCombo` et compagnie.
 */
export function useBotPlayer(weights: HeuristicWeights = CEM_WEIGHTS) {
    const bot: Bot = makeGreedyBot(weights, 'greedy-cem')
    const rng = makeRng(Date.now() >>> 0)

    function decide(store: GameStore, playerId: string): BotDecision | null {
        const player = store.players.find(p => p.id === playerId)
        if (!player || !store.currentRoll) return null

        const isActive = playerId === store.activePlayerId
        const useAllDices = isActive || store.turnNumber < 3
        const pool = useAllDices
            ? { colorDices: [...store.currentRoll.colorDices], numberDices: [...store.currentRoll.numberDices] }
            : store.availableForPassive

        const roll: Roll = {
            colors: pool.colorDices.map(d => d.value as ColorFace),
            numbers: pool.numberDices.map(d => d.value as NumberFace),
        }

        const sheet = { mask: maskFromSet(player.checkedCells), jokersUsed: player.jokersUsed }
        const moves = legalMoves(store.grid.cells, sheet, roll, { totalJokers: store.grid.jokers })

        const move: Move | null = bot.chooseMove({
            cells: store.grid.cells,
            sheet,
            moves,
            turn: store.turnNumber,
            totalJokers: store.grid.jokers,
            rng,
        })
        if (!move) return null

        const colorFace = roll.colors[move.colorDieIndex]
        const numberFace = roll.numbers[move.numberDieIndex]

        return {
            colorDiceIndex: move.colorDieIndex,
            numberDiceIndex: move.numberDieIndex,
            jokerColor: colorFace === 'joker' ? move.color : undefined,
            jokerCount: numberFace === 'joker' ? move.count : undefined,
            placement: [...move.placement],
        }
    }

    return { decide, name: bot.name }
}
