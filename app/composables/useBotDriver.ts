import { watch } from 'vue'
import type { Ref } from 'vue'
import { rollAllDices, useGameStore } from '~/stores/gameStore'
import { useBotPlayer } from '~/composables/useBotPlayer'
import type { DifficultyId } from '~/composables/useBotPlayer'
import { parseBotId } from '~/utils/botIdentity'
import type { GameActionType } from '~/services/realtimeService'

type Dispatch = (type: GameActionType, payload?: Record<string, unknown>) => void

/** Respirations entre deux gestes d'un bot, pour que la partie reste lisible. */
const DELAY_ROLL = 650
const DELAY_ACTIVE = 700
const DELAY_PASSIVE = 600
const DELAY_NEXT_TURN = 1500

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Joue les tours des bots d'une partie multijoueur.
 *
 * UN SEUL CLIENT pilote : celui de l'hote (siege 0). Si deux clients pilotaient
 * le meme bot, chacun emettrait le meme coup et le store l'appliquerait deux
 * fois.
 *
 * Les coups passent par `dispatch` et JAMAIS par les actions du store en
 * direct. `dispatch` applique en local, diffuse aux pairs et persiste dans
 * `game_events` : un appel direct au store laisserait les autres clients dans
 * un etat different et le rejeu a la reconnexion reconstruirait un autre
 * plateau.
 *
 * Deux transitions meritent une attention particuliere, parce que l'interface
 * ne les emet que depuis le client du joueur actif — ce qu'un bot n'a pas :
 *
 *   - le lancer de des en `waiting_roll`, sinon la partie ne demarre pas ;
 *   - `NEXT_TURN` en `turn_end`, sinon elle se fige a la fin du tour.
 *
 * Si l'hote ferme son onglet, les bots cessent d'agir. Le minuteur de tour fait
 * alors passer automatiquement les joueurs qui n'ont pas agi, donc la partie
 * continue sans blocage — les bots passent simplement leur tour.
 */
export function useBotDriver(dispatch: Dispatch, isHost: Ref<boolean>) {
    const store = useGameStore()

    // Un bot par niveau : la temperature est fixee a la construction, et deux
    // bots de meme niveau peuvent partager la meme politique.
    const byDifficulty = new Map<DifficultyId, ReturnType<typeof useBotPlayer>>()
    function playerFor(difficulty: DifficultyId) {
        let player = byDifficulty.get(difficulty)
        if (!player) {
            player = useBotPlayer(difficulty)
            byDifficulty.set(difficulty, player)
        }
        return player
    }

    const difficultyOf = (playerId: string | null): DifficultyId | null =>
        playerId ? parseBotId(playerId)?.difficulty ?? null : null

    /** Joue un coup complet pour un bot : combo, placement, validation. */
    function playBot(id: string, difficulty: DifficultyId): void {
        const decision = playerFor(difficulty).decide(store, id)
        const isActive = id === store.activePlayerId && store.phase === 'active_selecting'

        if (!decision) {
            if (isActive) dispatch('PASS_ACTIVE', { reason: 'no-placement' })
            else dispatch('PASS_PASSIVE', { playerId: id, reason: 'no-placement' })
            return
        }

        const combo = {
            colorDiceIndex: decision.colorDiceIndex,
            numberDiceIndex: decision.numberDiceIndex,
            jokerColor: decision.jokerColor,
            jokerCount: decision.jokerCount,
        }

        if (isActive) dispatch('CONFIRM_ACTIVE', combo)
        else dispatch('CONFIRM_PASSIVE', { playerId: id, ...combo })

        // Le store auto-passe si la combo confirmee n'offre aucun placement.
        const player = store.players.find(p => p.id === id)
        if (!player?.confirmedCombo) return

        for (const idx of decision.placement) dispatch('TOGGLE_CELL', { playerId: id, cellIdx: idx })
        dispatch('CONFIRM_PLACEMENT', { playerId: id })
    }

    /**
     * Fait avancer la partie tant qu'un bot doit agir, puis rend la main des
     * qu'un humain est attendu. Le garde d'iterations protege d'une boucle
     * infinie si une phase cessait de progresser.
     */
    let driving = false
    async function drive(): Promise<void> {
        if (!isHost.value || driving) return
        driving = true
        try {
            for (let guard = 0; guard < 200; guard++) {
                if (!isHost.value) break
                if (store.gameOver && store.phase === 'turn_end') break

                const activeDifficulty = difficultyOf(store.activePlayerId)

                if (store.phase === 'waiting_roll') {
                    if (!activeDifficulty) break
                    await wait(DELAY_ROLL)
                    // L'etat a pu changer pendant l'attente : un coup distant est
                    // arrive, ou l'humain a agi. On repart de la phase courante.
                    if (store.phase !== 'waiting_roll') continue
                    dispatch('ROLL_DICES', { roll: rollAllDices() })
                    continue
                }

                if (store.phase === 'active_selecting') {
                    if (!activeDifficulty || !store.activePlayerId) break
                    await wait(DELAY_ACTIVE)
                    if (store.phase !== 'active_selecting') continue
                    playBot(store.activePlayerId, activeDifficulty)
                    continue
                }

                if (store.phase === 'passive_selecting') {
                    const pending = store.players.find(p =>
                        difficultyOf(p.id) !== null && !p.hasPlaced && !p.hasPassed,
                    )
                    if (!pending) break
                    await wait(DELAY_PASSIVE)
                    if (store.phase !== 'passive_selecting') continue
                    const difficulty = difficultyOf(pending.id)
                    if (!difficulty) continue
                    playBot(pending.id, difficulty)
                    continue
                }

                if (store.phase === 'turn_end') {
                    if (!activeDifficulty) break
                    await wait(DELAY_NEXT_TURN)
                    if (store.phase !== 'turn_end' || store.gameOver) break
                    dispatch('NEXT_TURN', {})
                    continue
                }

                break
            }
        } finally {
            driving = false
        }
    }

    // Toute transition susceptible d'appeler un bot relance la boucle. Elle est
    // re-entrante : un declenchement pendant qu'elle tourne est ignore, et
    // l'iteration en cours relit l'etat de toute facon.
    watch(
        () => [
            store.phase,
            store.activePlayerId,
            store.turnNumber,
            store.players.map(p => `${p.hasPlaced ? 1 : 0}${p.hasPassed ? 1 : 0}`).join(''),
        ].join('|'),
        () => { void drive() },
    )

    return { drive }
}
