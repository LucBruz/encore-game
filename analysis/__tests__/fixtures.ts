import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '~/stores/gameStore'
import type { GameEvent } from '~~/analysis/replay'

/**
 * Journal reel, extrait de la partie 0VITRI jouee en production : les deux
 * premiers tours, un humain qui passe et un bot qui place.
 *
 * Des evenements inventes ne testeraient que ma comprehension du format. Ceux-ci
 * ont ete produits par le jeu lui-meme.
 */
export const HUMAN = 'dad2294d-9788-4f90-a27f-4c4f8f7f29c0'
export const BOT = 'bot:hard:1'

const roll = (colors: unknown[], numbers: unknown[]) => ({
    roll: {
        colorDices: colors.map(value => ({ type: 'color', value })),
        numberDices: numbers.map(value => ({ type: 'number', value })),
    },
})

export const EVENTS: GameEvent[] = [
    { event_type: 'ROLL_DICES', payload: roll(['joker', 'y', 'g'], [5, 1, 5]) },
    { event_type: 'CONFIRM_PASSIVE', payload: { playerId: BOT, colorDiceIndex: 1, numberDiceIndex: 0 } },
    ...[82, 83, 98, 99, 97].map(cellIdx => ({
        event_type: 'TOGGLE_CELL', payload: { cellIdx, playerId: BOT },
    })),
    { event_type: 'CONFIRM_PLACEMENT', payload: { playerId: BOT } },
    { event_type: 'PASS_PASSIVE', payload: { playerId: HUMAN } },
    { event_type: 'NEXT_TURN', payload: {} },
    { event_type: 'ROLL_DICES', payload: roll(['y', 'p', 'b'], [1, 1, 4]) },
    { event_type: 'PASS_PASSIVE', payload: { playerId: HUMAN } },
    { event_type: 'CONFIRM_PASSIVE', payload: { playerId: BOT, colorDiceIndex: 1, numberDiceIndex: 2 } },
    ...[23, 38, 39, 37].map(cellIdx => ({
        event_type: 'TOGGLE_CELL', payload: { cellIdx, playerId: BOT },
    })),
    { event_type: 'CONFIRM_PLACEMENT', payload: { playerId: BOT } },
]

export function freshStore() {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.initPlayers([{ id: HUMAN, name: 'TestRejeu' }, { id: BOT, name: 'Bot difficile 1' }])
    store.initGrid('01')
    return store
}
