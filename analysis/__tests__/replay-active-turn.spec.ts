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

    it('retrouve chaque coup joue parmi les coups legaux de sa position', () => {
        for (const d of replayDecisions(freshStore(), EVENTS)) {
            expect(d.played, `tour ${d.turn}, ${d.playerName}`).not.toBeNull()
            expect(d.candidates.some(c => sameMove(c, d.played)), `tour ${d.turn}, ${d.playerName}`).toBe(true)
        }
    })
})
