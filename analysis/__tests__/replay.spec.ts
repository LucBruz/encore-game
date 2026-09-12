import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '~/stores/gameStore'
import { applyGameAction } from '~/utils/applyGameAction'
import { replayDecisions } from '~~/analysis/replay'
import { sameMove } from '~~/analysis/evaluate'
import type { GameEvent } from '~~/analysis/replay'

/**
 * Journal reel, extrait de la partie 0VITRI jouee en production : les deux
 * premiers tours, un humain qui passe et un bot qui place.
 *
 * Des evenements inventes ne testeraient que ma comprehension du format. Ceux-ci
 * ont ete produits par le jeu lui-meme.
 */
const HUMAN = 'dad2294d-9788-4f90-a27f-4c4f8f7f29c0'
const BOT = 'bot:hard:1'

const roll = (colors: unknown[], numbers: unknown[]) => ({
    roll: {
        colorDices: colors.map(value => ({ type: 'color', value })),
        numberDices: numbers.map(value => ({ type: 'number', value })),
    },
})

const EVENTS: GameEvent[] = [
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

function freshStore() {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.initPlayers([{ id: HUMAN, name: 'TestRejeu' }, { id: BOT, name: 'Bot difficile 1' }])
    store.initGrid('01')
    return store
}

describe('rejeu du journal vers des positions de decision', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('reconstruit le meme plateau que l application directe des evenements', () => {
        const direct = freshStore()
        for (const e of EVENTS) applyGameAction(direct, e.event_type as any, e.payload)
        const expected = direct.players.map(p => [...p.checkedCells].sort((a, b) => a - b))

        const replayed = freshStore()
        replayDecisions(replayed, EVENTS)
        const got = replayed.players.map(p => [...p.checkedCells].sort((a, b) => a - b))

        expect(got).toEqual(expected)
    })

    /**
     * L'invariant qui compte. Si le rejeu se trompe sur l'etat — mauvais lancer,
     * mauvaise feuille, mauvais joueur — le coup reellement joue ne figurera pas
     * parmi les coups legaux calcules pour cette position. C'est ce test qui a
     * attrape la conversion manquante entre les des du store, objets
     * `{ type, value }`, et les faces attendues par le moteur.
     */
    it('retrouve chaque coup joue parmi les coups legaux de sa position', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        const played = decisions.filter(d => d.played !== null)
        expect(played.length).toBeGreaterThan(0)

        for (const d of played) {
            const found = d.candidates.some(c => sameMove(c, d.played))
            expect(found, `tour ${d.turn}, ${d.playerName}, cases ${d.played!.placement}`).toBe(true)
        }
    })

    it('extrait autant de decisions que de coups et de passes', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        // Deux placements du bot, deux passes de l'humain.
        expect(decisions.length).toBe(4)
        expect(decisions.filter(d => d.played === null).length).toBe(2)
        expect(decisions.filter(d => d.playerId === BOT).map(d => d.played!.placement.length))
            .toEqual([5, 4])
    })

    it('propose toujours le passe volontaire comme option', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        for (const d of decisions) expect(d.candidates).toContain(null)
    })

    it('photographie la position AVANT le coup, pas apres', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        const first = decisions.find(d => d.playerId === BOT)!
        // Au premier tour le bot n'a encore rien coche : sa feuille doit etre vide.
        expect(first.players[first.seat].sheet.mask.some(v => v === 1)).toBe(false)
    })
})
