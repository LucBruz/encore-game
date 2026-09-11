import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '~/stores/gameStore'
import type { DiceColor, DiceNumber, DicesRoll } from '~/stores/gameStore'
import { makeRng, rollDice } from '~~/engine/dice'
import { DIFFICULTIES, useBotPlayer } from '../useBotPlayer'
import type { DifficultyId } from '../useBotPlayer'
import { validatePlacement } from '~~/engine/placement'
import { maskFromSet } from '~~/engine/mask'

/**
 * Le maillon fragile du mode solo est la traduction entre le moteur headless et le
 * store : indices de des relatifs a la liste disponible, resolution des jokers,
 * placement case par case. Une partie complete pilotee par le bot verifie que
 * chaque coup passe la validation des regles et qu'aucun joueur ne se bloque.
 */
describe('useBotPlayer — pilotage du store', () => {
    beforeEach(() => setActivePinia(createPinia()))

    /**
     * Des tires d'un PRNG a graine fixe. `rollAllDices()` du store utilise
     * Math.random : s'en servir ici rendrait le test non deterministe, et il l'a
     * effectivement ete (un echec sur trois executions).
     */
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

    function playSoloGame(gridId: string, maxTurns = 60, difficulty: DifficultyId = 'hard', seed = 424242) {
        const store = useGameStore()
        const bot = useBotPlayer(difficulty, seed)
        const nextRoll = seededRolls(seed)
        store.initPlayers([{ id: 'bot-1', name: 'A' }, { id: 'bot-2', name: 'B' }])
        store.initGrid(gridId)

        let illegal = 0
        let placements = 0

        for (let guard = 0; guard < maxTurns * 6; guard++) {
            if (store.gameOver && store.phase === 'turn_end') break
            if (store.turnNumber >= maxTurns) break

            if (store.phase === 'waiting_roll') {
                store.rollDicesWithResult(nextRoll())
                continue
            }

            const actOne = (id: string, active: boolean) => {
                const decision = bot.decide(store, id)
                if (!decision) {
                    if (active) store.passActiveTurn()
                    else store.passPassiveTurn(id)
                    return
                }
                const player = store.players.find(p => p.id === id)!
                const maskBefore = maskFromSet(player.checkedCells)

                if (active) {
                    store.confirmActiveCombo(
                        decision.colorDiceIndex, decision.numberDiceIndex,
                        decision.jokerColor, decision.jokerCount,
                    )
                } else {
                    store.confirmPassiveCombo(
                        id, decision.colorDiceIndex, decision.numberDiceIndex,
                        decision.jokerColor, decision.jokerCount,
                    )
                }

                const combo = player.confirmedCombo
                if (!combo) return // auto-pass : aucune combinaison jouable

                const check = validatePlacement(
                    decision.placement, store.grid.cells, maskBefore, combo.color, combo.count,
                )
                if (!check.valid) illegal++

                for (const idx of decision.placement) store.togglePendingCell(id, idx)
                store.confirmPendingCells(id)
                if (player.hasPlaced) placements++
            }

            if (store.phase === 'active_selecting') {
                actOne(store.activePlayerId, true)
                continue
            }

            if (store.phase === 'passive_selecting') {
                const pending = store.players.find(p => !p.hasPlaced && !p.hasPassed)
                if (pending) { actOne(pending.id, false); continue }
                if (store.phase === 'passive_selecting') break // blocage : personne ne peut avancer
                continue
            }

            if (store.phase === 'turn_end') {
                if (store.gameOver) break
                store.nextTurn()
                continue
            }
            break
        }

        return { store, illegal, placements }
    }

    it('joue une partie complete sur chaque grille sans coup illegal', () => {
        for (const gridId of ['01', '02', '03', '04', '05', '06', '07', '08']) {
            const { store, illegal, placements } = playSoloGame(gridId)
            expect(illegal, `grille ${gridId}`).toBe(0)
            expect(placements, `grille ${gridId}`).toBeGreaterThan(10)
            // Chaque joueur a un score coherent et des jokers dans les bornes.
            for (const p of store.players) {
                expect(p.jokersUsed).toBeGreaterThanOrEqual(0)
                expect(p.jokersUsed).toBeLessThanOrEqual(store.grid.jokers)
                expect(p.pendingJokers).toBe(0)
            }
        }
    })

    it('atteint la fin de partie par deux couleurs completes', () => {
        const { store } = playSoloGame('01', 80)
        expect(store.gameOver).toBe(true)
    })

    it('produit des scores nettement superieurs a une feuille vide', () => {
        // Moyenne sur plusieurs graines plutot qu'un seuil par joueur : une partie
        // isolee peut mal tourner sans que l'agent soit en cause.
        const scores: number[] = []
        for (const seed of [1, 2, 3, 4, 5, 6]) {
            const { store } = playSoloGame('01', 80, 'hard', seed * 7919)
            for (const p of store.players) scores.push(store.scoreForPlayer(p.id))
        }
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length
        expect(mean).toBeGreaterThan(15)
        for (const s of scores) expect(s).toBeGreaterThan(0)
    })

    it('joue legalement aux trois niveaux de difficulte', () => {
        for (const level of Object.keys(DIFFICULTIES) as DifficultyId[]) {
            const { illegal, placements } = playSoloGame('01', 60, level)
            expect(illegal, level).toBe(0)
            expect(placements, level).toBeGreaterThan(8)
        }
    })
})
