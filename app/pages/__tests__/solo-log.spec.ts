import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore, type DicesRoll } from '~/stores/gameStore'
import { applyGameAction } from '~/utils/applyGameAction'
import type { GameActionType } from '~/services/realtimeService'
import { useBotPlayer } from '~/composables/useBotPlayer'
import { makeRng, rollDice } from '~~/engine/dice'
import { replayDecisions } from '~~/analysis/replay'

/**
 * Le mode solo ne passe ni par le reseau ni par Supabase : il tient son propre
 * journal de coups pour que l'analyse d'apres-partie ait quelque chose a relire.
 * Ce journal ne vaut que s'il rejoue EXACTEMENT la partie qui a ete jouee — sinon
 * l'analyse jugerait des positions que le joueur n'a jamais vues.
 *
 * Le pilotage reproduit ici celui de `app/pages/solo.vue` : meme enchainement,
 * meme passage par `applyGameAction`, sans les attentes d'animation.
 */
describe('mode solo — le journal rejoue la partie', { timeout: 30_000 }, () => {
    beforeEach(() => setActivePinia(createPinia()))

    /** Des a graine fixe : `rollAllDices()` tire de Math.random et rendrait le test instable. */
    function seededRolls(seed: number): () => DicesRoll {
        const rng = makeRng(seed)
        return () => {
            const r = rollDice(rng)
            return {
                colorDices: r.colors.map(v => ({ type: 'color', value: v })) as DicesRoll['colorDices'],
                numberDices: r.numbers.map(v => ({ type: 'number', value: v })) as DicesRoll['numberDices'],
            }
        }
    }

    type Event = { event_type: GameActionType; payload: Record<string, unknown> }

    /** Joue une partie complete pilotee par les bots et renvoie son journal. */
    function playSoloGame(seed: number, gridId = '03') {
        const store = useGameStore()
        const bot = useBotPlayer('hard')
        const nextRoll = seededRolls(seed)
        const log: Event[] = []

        const play = (type: GameActionType, payload: Record<string, unknown> = {}) => {
            log.push({ event_type: type, payload })
            applyGameAction(store, type, payload)
        }

        const ids = ['p-human', 'bot-1']
        store.initPlayers(ids.map((id, i) => ({ id, name: i === 0 ? 'Toi' : 'Bot' })))
        store.initGrid(gridId)

        const playFor = (id: string) => {
            const decision = bot.decide(store, id)
            const isActive = id === store.activePlayerId && store.phase === 'active_selecting'
            if (!decision) {
                if (isActive) play('PASS_ACTIVE', { reason: 'no-placement' })
                else play('PASS_PASSIVE', { playerId: id, reason: 'no-placement' })
                return
            }
            const combo = {
                colorDiceIndex: decision.colorDiceIndex, numberDiceIndex: decision.numberDiceIndex,
                jokerColor: decision.jokerColor, jokerCount: decision.jokerCount,
            }
            if (isActive) play('CONFIRM_ACTIVE', combo)
            else play('CONFIRM_PASSIVE', { playerId: id, ...combo })

            if (!store.players.find(p => p.id === id)?.confirmedCombo) return
            for (const idx of decision.placement) play('TOGGLE_CELL', { playerId: id, cellIdx: idx })
            play('CONFIRM_PLACEMENT', { playerId: id })
        }

        for (let guard = 0; guard < 400; guard++) {
            if (store.gameOver && store.phase === 'turn_end') break
            if (store.phase === 'waiting_roll') { play('ROLL_DICES', { roll: nextRoll() }); continue }
            if (store.phase === 'active_selecting') { playFor(store.activePlayerId); continue }
            if (store.phase === 'passive_selecting') {
                const pending = store.players.find(p => !p.hasPlaced && !p.hasPassed)
                if (pending) { playFor(pending.id); continue }
                if (store.phase !== 'turn_end') break
                continue
            }
            if (store.phase === 'turn_end') {
                if (store.gameOver) break
                play('NEXT_TURN', {})
                continue
            }
            break
        }

        return {
            log,
            gridId,
            ids,
            scores: ids.map(id => store.scoreForPlayer(id)),
            checked: ids.map(id => store.players.find(p => p.id === id)!.checkedCells.size),
            turns: store.turnNumber,
        }
    }

    it('une partie rejouee depuis son journal donne les memes scores', () => {
        const played = playSoloGame(31_415)
        expect(played.log.length).toBeGreaterThan(50)
        expect(played.turns).toBeGreaterThan(5)

        // Rejeu dans un store neuf, comme le fait l'analyse.
        setActivePinia(createPinia())
        const replayed = useGameStore()
        replayed.initPlayers(played.ids.map((id, i) => ({ id, name: i === 0 ? 'Toi' : 'Bot' })))
        replayed.initGrid(played.gridId)
        for (const e of played.log) applyGameAction(replayed, e.event_type, e.payload)

        expect(played.ids.map(id => replayed.scoreForPlayer(id))).toEqual(played.scores)
        expect(played.ids.map(id => replayed.players.find(p => p.id === id)!.checkedCells.size))
            .toEqual(played.checked)
        expect(replayed.turnNumber).toBe(played.turns)
        expect(replayed.gameOver).toBe(true)
    })

    it('l\'analyse retrouve les decisions du joueur dans ce journal', () => {
        const played = playSoloGame(2_718)

        setActivePinia(createPinia())
        const store = useGameStore()
        store.initPlayers(played.ids.map((id, i) => ({ id, name: i === 0 ? 'Toi' : 'Bot' })))
        store.initGrid(played.gridId)

        const decisions = replayDecisions(store, played.log as any)
        const mine = decisions.filter(d => d.playerId === 'p-human')
        expect(mine.length).toBeGreaterThan(5)
        // Chaque decision porte sa position et les coups qui s'offraient alors.
        for (const d of mine) {
            expect(d.cells.length).toBe(105)
            expect(d.candidates.length).toBeGreaterThan(0)
            expect(d.players[d.seat]).toBeTruthy()
        }
        // Le coup joue fait partie des coups legaux de sa position : sans cela,
        // l'analyse comparerait le joueur a des options qu'il n'avait pas.
        const joue = mine.filter(d => d.played)
        expect(joue.length).toBeGreaterThan(3)
        for (const d of joue) {
            const meme = d.candidates.some(c => c
                && c.color === d.played!.color
                && c.count === d.played!.count
                && [...c.placement].sort().join() === [...d.played!.placement].sort().join())
            expect(meme).toBe(true)
        }
    })
})
