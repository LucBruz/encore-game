import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { applyGameAction } from '~/utils/applyGameAction'
import { replayDecisions } from '~~/analysis/replay'
import { sameMove } from '~~/analysis/evaluate'
import { BOT, EVENTS, HUMAN, freshStore } from './fixtures-active-turn'

describe('rejeu d un tour actif clos par NEXT_TURN (partie FZFS1D)', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('reconstruit le meme plateau que l application directe des evenements', () => {
        const direct = freshStore()
        for (const e of EVENTS) applyGameAction(direct, e.event_type as any, e.payload)
        const expected = direct.players.map(p => [...p.checkedCells].sort((a, b) => a - b))

        const replayed = freshStore()
        replayDecisions(replayed, EVENTS)
        expect(replayed.players.map(p => [...p.checkedCells].sort((a, b) => a - b))).toEqual(expected)

        // Le coup de l'humain au tour 4 a bien ete joue dans la partie.
        const human = direct.players.find(p => p.id === HUMAN)!
        expect(human.checkedCells.has(5) && human.checkedCells.has(6)).toBe(true)
        expect(direct.turnNumber).toBe(5)
    })

    it('compte le coup de l actif valide par NEXT_TURN', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        const human = decisions.filter(d => d.playerId === HUMAN)

        expect(human.map(d => d.turn)).toEqual([0, 1, 2, 3, 4])
        const turn4 = human.find(d => d.turn === 4)!
        expect(turn4.played).toMatchObject({ color: 'y', count: 2 })
        expect([...turn4.played!.placement].sort((a, b) => a - b)).toEqual([5, 6])
    })

    it('compte chaque coup une seule fois', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        expect(decisions.filter(d => d.playerId === BOT).map(d => d.turn)).toEqual([0, 1, 2, 3, 4])
        expect(decisions).toHaveLength(10)
    })

    /**
     * La partie FZFS1D se termine ainsi au tour 30 : combo de l'humain, une case,
     * GAME_OVER, une case, NEXT_TURN — refuse par `nextTurn`, la partie etant
     * finie — deux cases, puis CONFIRM_PLACEMENT. Rejoue ici sur le vrai tour 5
     * de la meme partie (lancer, coup du bot et cases de l'humain reels), avec
     * l'ordre de fin de partie du tour 30. Le premier correctif du rejeu vidait
     * les combos ouvertes sur tout NEXT_TURN et perdait ce dernier coup.
     */
    it('garde le coup ouvert quand NEXT_TURN est refuse en fin de partie', () => {
        const toggle = (cellIdx: number) => ({ event_type: 'TOGGLE_CELL', payload: { cellIdx, playerId: HUMAN } })
        const events = [
            ...EVENTS,
            { event_type: 'ROLL_DICES', payload: { roll: {
                colorDices: ['o', 'y', 'o'].map(value => ({ type: 'color', value })),
                numberDices: [4, 'joker', 2].map(value => ({ type: 'number', value })),
            } } },
            { event_type: 'CONFIRM_ACTIVE', payload: { colorDiceIndex: 0, numberDiceIndex: 2 } },
            { event_type: 'TOGGLE_CELL', payload: { cellIdx: 11, playerId: BOT } },
            { event_type: 'TOGGLE_CELL', payload: { cellIdx: 26, playerId: BOT } },
            { event_type: 'CONFIRM_PLACEMENT', payload: { playerId: BOT } },
            { event_type: 'CONFIRM_PASSIVE', payload: { playerId: HUMAN, colorDiceIndex: 0, numberDiceIndex: 0 } },
            toggle(55),
            { event_type: 'GAME_OVER', payload: {} },
            toggle(40),
            { event_type: 'NEXT_TURN', payload: {} },
            toggle(56),
            toggle(41),
            { event_type: 'CONFIRM_PLACEMENT', payload: { playerId: HUMAN } },
        ]

        const last = replayDecisions(freshStore(), events).filter(d => d.playerId === HUMAN).at(-1)!
        expect(last.turn).toBe(5)
        expect([...last.played!.placement].sort((a, b) => a - b)).toEqual([40, 41, 55, 56])
    })

    it('retrouve chaque coup joue parmi les coups legaux de sa position', () => {
        for (const d of replayDecisions(freshStore(), EVENTS)) {
            expect(d.played, `tour ${d.turn}, ${d.playerName}`).not.toBeNull()
            expect(d.candidates.some(c => sameMove(c, d.played)), `tour ${d.turn}, ${d.playerName}`).toBe(true)
        }
    })
})
