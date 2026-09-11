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
 * Poids de l'heuristique v3, optimises par CEM DIRECTEMENT EN PARTIE A 4 JOUEURS
 * (scripts/tune-multi.ts). Voir public/data/tuned-weights-multi.json.
 *
 * Ne pas revenir a un reglage solitaire : mesure faite, l'agent le mieux note en
 * solitaire arrive DERNIER a une table de 4 (15,27 contre 26,65), parce que le
 * solitaire ne punit pas la temporisation — l'agent y decide seul de la fin.
 */
export const V3_WEIGHTS: WeightsV3 = {
    columnExponent: 2.4788,
    extremeColumnEarly: 8.8423,
    colorExponent: 1.8797,
    colorValueEarly: 1.4017,
    colorValueLate: 3.9927,
    orphan1: 2.2489,
    orphan2: 1.7119,
    frontierEarly: 1.1592,
    jokerValue: 3.6031,
    starValue: 1.5706,
    cellValue: 0.4563,
    earlyHorizon: 18.7238,
    lateHorizon: 24.3142,
}

export type DifficultyId = 'easy' | 'medium' | 'hard'

/**
 * Temperatures calibrees par dichotomie (scripts/calibrate.ts), mesurees EN PARTIE
 * A 4 JOUEURS : chaque niveau affronte trois exemplaires du niveau maximal.
 *
 * La cible est un TAUX DE VICTOIRE et non un score : a une table de 4, un score
 * absolu depend autant des adversaires que de l'agent, alors que la frequence de
 * victoire est ce qu'un joueur humain ressent. Le plafond est ~25 pour cent,
 * puisque quatre joueurs identiques se partagent les victoires.
 */
export const DIFFICULTIES: Record<DifficultyId, {
    label: string
    temperature: number
    winRate: number
    meanScore: number
}> = {
    easy: { label: 'Facile', temperature: 0.378, winRate: 6.8, meanScore: 11.3 },
    medium: { label: 'Moyen', temperature: 0.179, winRate: 21.0, meanScore: 16.8 },
    hard: { label: 'Difficile', temperature: 0, winRate: 27.4, meanScore: 18.6 },
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
export function useBotPlayer(difficulty: DifficultyId = 'hard', seed?: number) {
    const scorer = makeV3MoveScorer(V3_WEIGHTS)
    const { temperature, label } = DIFFICULTIES[difficulty]
    const bot: Bot = makeTemperedBot(scorer, temperature, `v3-${difficulty}`)
    // Graine explicite en test, horloge en jeu : les niveaux 'easy' et 'medium'
    // tirent au sort, donc sans graine fixe un test devient non deterministe.
    const rng = makeRng(seed ?? (Date.now() >>> 0))

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
