import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '~/stores/gameStore'
import type { GameEvent } from '~~/analysis/replay'

/**
 * Journal reel des tours 0 a 4 de la partie FZFS1D, jouee en production le
 * 2026-09-14 par un humain contre un bot, grille 01, humain au siege 0.
 *
 * Au tour 4, l'humain est actif. Le journal montre sa combo, le placement complet
 * du bot, ses deux cases — puis NEXT_TURN, sans CONFIRM_PLACEMENT de sa part :
 * l'ancienne regle terminait le tour des que les passifs avaient fini, et
 * `nextTurn` validait la selection restee en attente. C'est la forme de tous les
 * tours actifs de l'humain dans cette partie, et ils manquaient a l'analyse.
 */
export const HUMAN = '6a382549-8db0-410e-8e93-86743ce3e102'
export const BOT = 'bot:hard:1'

const roll = (colors: unknown[], numbers: unknown[]) => ({
    event_type: 'ROLL_DICES',
    payload: {
        roll: {
            colorDices: colors.map(value => ({ type: 'color', value })),
            numberDices: numbers.map(value => ({ type: 'number', value })),
        },
    },
})
const passive = (playerId: string, colorDiceIndex: number, numberDiceIndex: number, extra = {}) =>
    ({ event_type: 'CONFIRM_PASSIVE', payload: { playerId, colorDiceIndex, numberDiceIndex, ...extra } })
const active = (colorDiceIndex: number, numberDiceIndex: number, extra = {}) =>
    ({ event_type: 'CONFIRM_ACTIVE', payload: { colorDiceIndex, numberDiceIndex, ...extra } })
const cells = (playerId: string, ...idx: number[]) =>
    idx.map(cellIdx => ({ event_type: 'TOGGLE_CELL', payload: { cellIdx, playerId } }))
const place = (playerId: string) => ({ event_type: 'CONFIRM_PLACEMENT', payload: { playerId } })
const next = { event_type: 'NEXT_TURN', payload: {} }

export const EVENTS: GameEvent[] = [
    // Tour 0, simultane
    roll(['joker', 'joker', 'b'], [4, 3, 'joker']),
    passive(BOT, 2, 0), ...cells(BOT, 51, 52, 67, 66), place(BOT),
    passive(HUMAN, 2, 1), ...cells(HUMAN, 52, 66, 51), place(HUMAN),
    // Tour 1, simultane
    next, roll(['g', 'g', 'y'], [2, 3, 4]),
    passive(BOT, 0, 1), ...cells(BOT, 34, 35, 36), place(BOT),
    passive(HUMAN, 0, 0), ...cells(HUMAN, 54, 53), place(HUMAN),
    // Tour 2, simultane
    next, roll(['o', 'p', 'y'], [4, 2, 2]),
    passive(BOT, 1, 0), ...cells(BOT, 65, 80, 79, 78), place(BOT),
    passive(HUMAN, 0, 1), ...cells(HUMAN, 22, 21), place(HUMAN),
    // Tour 3, bot actif
    next, roll(['g', 'joker', 'joker'], ['joker', 5, 'joker']),
    active(0, 0, { jokerCount: 2 }), ...cells(BOT, 53, 54), place(BOT),
    passive(HUMAN, 1, 1, { jokerColor: 'g', jokerCount: 3 }), ...cells(HUMAN, 35, 34, 36), place(HUMAN),
    // Tour 4, humain actif : pas de CONFIRM_PLACEMENT de sa part
    next, roll(['joker', 'y', 'y'], ['joker', 4, 2]),
    active(1, 2),
    passive(BOT, 1, 1), ...cells(BOT, 40, 41, 56, 55), place(BOT),
    ...cells(HUMAN, 5, 6),
    next,
]

export function freshStore() {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.initPlayers([{ id: HUMAN, name: 'LucTest' }, { id: BOT, name: 'Bot difficile 1' }])
    store.initGrid('01')
    return store
}
