import { makeTemperedBot } from '~~/bots/difficulty'
import type { WeightsV3 } from '~~/bots/heuristicV3'
import { makeV3MoveScorer } from '~~/bots/scorers'
import type { Bot } from '~~/bots/types'
import type { ColorFace, NumberFace, Roll } from '~~/engine/dice'
import { makeRng } from '~~/engine/dice'
import { maskFromSet } from '~~/engine/mask'
import { legalMoves } from '~~/engine/state'
import type { Move } from '~~/engine/state'
import type { useGameStore } from '~/stores/gameStore'
import type { ColorKey } from '~/data/grids/grid-01'

type GameStore = ReturnType<typeof useGameStore>

/**
 * Poids de l'heuristique v3, appris par CEM (scripts/tune-v3.ts) et recopies ici
 * pour eviter un fetch au runtime. Voir public/data/tuned-weights-v3.json.
 */
export const V3_WEIGHTS: WeightsV3 = {
    columnExponent: 2.7615,
    extremeColumnEarly: 4.5099,
    colorExponent: 0.51,
    colorValueEarly: 0.2709,
    colorValueLate: 1.3273,
    orphan1: 0.2506,
    orphan2: 0.7549,
    frontierEarly: 0.1803,
    jokerValue: 4.9948,
    starValue: 3.0055,
    cellValue: 0.0397,
    earlyHorizon: 16.088,
    lateHorizon: 31.674,
}

export type DifficultyId = 'easy' | 'medium' | 'hard'

/**
 * Temperatures calibrees par dichotomie sur un score cible (scripts/calibrate.ts).
 * Les moyennes sont mesurees sur 800 parties, 8 grilles en rotation.
 */
export const DIFFICULTIES: Record<DifficultyId, {
    label: string
    temperature: number
    meanScore: number
}> = {
    easy: { label: 'Facile', temperature: 0.912, meanScore: 20.1 },
    medium: { label: 'Moyen', temperature: 0.459, meanScore: 30.1 },
    hard: { label: 'Difficile', temperature: 0, meanScore: 36.1 },
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
export function useBotPlayer(difficulty: DifficultyId = 'hard') {
    const scorer = makeV3MoveScorer(V3_WEIGHTS)
    const { temperature, label } = DIFFICULTIES[difficulty]
    const bot: Bot = makeTemperedBot(scorer, temperature, `v3-${difficulty}`)
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

    return { decide, name: bot.name, label }
}
