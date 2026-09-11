import { ref } from 'vue'
import { useGameStore } from '~/stores/gameStore'
import type { LobbyPlayer } from '~/stores/lobbyStore'
import {
    joinGameChannel,
    sendAction,
    leaveGameChannel,
} from '~/services/realtimeService'
import type { GameActionType, GameAction } from '~/services/realtimeService'

// ─── COMPOSABLE ───────────────────────────────────────────────────────────────

export function useGameSync() {
    const store = useGameStore()
    const supabase = useSupabaseClient()

    const channel = ref<any>(null)
    const localPlayerId = ref('')
    const isReady = ref(false)

    // ── APPLY TO STORE ──────────────────────────────────────────────────────────

    /**
     * Applique une action directement au store local.
     * Utilisé par dispatch() ET applyRemoteAction() — jamais de broadcast ici.
     */
    function applyToStore(type: GameActionType, payload: Record<string, unknown>) {
        switch (type) {
            case 'ROLL_DICES':
                store.rollDicesWithResult(payload.roll as any)
                break
            case 'CONFIRM_ACTIVE':
                store.confirmActiveCombo(
                    payload.colorDiceIndex as number,
                    payload.numberDiceIndex as number,
                    payload.jokerColor as any,
                    payload.jokerCount as number | undefined,
                )
                break
            case 'CONFIRM_PASSIVE':
                store.confirmPassiveCombo(
                    payload.playerId as string,
                    payload.colorDiceIndex as number,
                    payload.numberDiceIndex as number,
                    payload.jokerColor as any,
                    payload.jokerCount as number | undefined,
                )
                break
            case 'PASS_ACTIVE': {
                // passActiveTurn() a un guard phase === 'active_selecting'
                // qui bloque les clients distants. On force manuellement.
                const activePlayer = store.players.find(p => p.id === store.activePlayerId)
                if (activePlayer) {
                    activePlayer.hasPassed = true
                    activePlayer.hasPlaced = true
                }
                store.activeSelection = null
                if ((store.phase as string) === 'active_selecting') {
                    store.phase = 'passive_selecting'
                }
                break
            }
            case 'PASS_PASSIVE':
            case 'TIMER_EXPIRED':
                store.passPassiveTurn(payload.playerId as string)
                break
            case 'TOGGLE_CELL':
                store.togglePendingCell(payload.playerId as string, payload.cellIdx as number)
                break
            case 'CONFIRM_PLACEMENT':
                store.confirmPendingCells(payload.playerId as string)
                break
            case 'CANCEL_PLACEMENT':
                store.cancelPendingCells(payload.playerId as string)
                break
            case 'USE_JOKER':
                // Obsolète : les jokers sont désormais débités par CONFIRM_PLACEMENT,
                // à partir de la combo confirmée. Aucun client n'émet cet event ;
                // le cas reste ici pour ne pas casser le rejeu d'anciennes parties.
                break
            case 'NEXT_TURN':
                store.nextTurn()
                break
            case 'GAME_OVER':
                store.setGameOver()
                break
        }
    }

    // ── DISPATCH ────────────────────────────────────────────────────────────────

    /**
     * Applique l'action localement EN PREMIER (optimistic),
     * puis la broadcast à tous les autres joueurs,
     * puis la persiste dans game_events (fire-and-forget).
     */
    function dispatch(type: GameActionType, payload: Record<string, unknown> = {}) {
        // 1. Appliquer localement
        applyToStore(type, payload)

        // 2. Broadcaster si le canal est prêt
        if (channel.value) {
            sendAction(channel.value, {
                type,
                senderId: localPlayerId.value,
                payload,
            })
        }

        // 3. Persister dans game_events (fire-and-forget)
        if (store.gameId) {
            supabase
                .from('game_events')
                .insert({
                    game_id: store.gameId as string,
                    turn_number: store.turnNumber,
                    player_id: localPlayerId.value,
                    event_type: type,
                    payload: payload as any,
                })
                .then(({ error }) => {
                    if (error) console.warn('[GameSync] Erreur persistance event:', error.message)
                })
        }
    }

    // ── APPLY REMOTE ACTION ─────────────────────────────────────────────────────

    /**
     * Reçoit une action distante.
     * Ignore si c'est notre propre action (déjà appliquée localement via dispatch).
     */
    function applyRemoteAction(action: GameAction) {
        if (action.senderId === localPlayerId.value) return
        applyToStore(action.type, action.payload)
    }

    // ── REPLAY EVENTS ───────────────────────────────────────────────────────────

    /**
     * Rejoue tous les events depuis Supabase pour rattraper un retard (reconnexion).
     * À appeler AVANT de rejoindre le canal pour éviter les doublons.
     */
    const VALID_EVENT_TYPES: GameActionType[] = [
        'ROLL_DICES', 'CONFIRM_ACTIVE', 'CONFIRM_PASSIVE', 'PASS_ACTIVE',
        'PASS_PASSIVE', 'TOGGLE_CELL', 'CONFIRM_PLACEMENT', 'CANCEL_PLACEMENT',
        'USE_JOKER', 'NEXT_TURN', 'TIMER_EXPIRED', 'GAME_OVER',
    ]

    async function replayEvents(gameId: string) {
        const { data: events, error } = await supabase
            .from('game_events')
            .select('event_type, payload')
            .eq('game_id', gameId)
            .order('created_at', { ascending: true })

        if (error) {
            console.warn('[GameSync] Erreur replay events:', error.message)
            return
        }

        events?.forEach(event => {
            const type = event.event_type as GameActionType
            if (!VALID_EVENT_TYPES.includes(type)) {
                console.warn('[GameSync] Event type inconnu ignoré:', event.event_type)
                return
            }
            applyToStore(type, event.payload as Record<string, unknown>)
        })
    }

    // ── SETUP ───────────────────────────────────────────────────────────────────

    /**
     * Initialise la sync pour une partie.
     * 1. Init le store avec les joueurs triés par seat
     * 2. Replay les events passés (reconnexion)
     * 3. Rejoindre le canal Realtime
     */
    async function setup(gameId: string, playerId: string, players: LobbyPlayer[]) {
        localPlayerId.value = playerId

        // Trier par seat et initialiser le store
        const sorted = [...players].sort((a, b) => a.seat - b.seat)
        store.initPlayers(sorted.map(p => ({ id: p.playerId, name: p.playerName })))

        // Stocker le gameId dans le store pour la persistance des events
        store.gameId = gameId

        // Replay des events AVANT de rejoindre le canal
        await replayEvents(gameId)

        // Rejoindre le canal
        channel.value = joinGameChannel(supabase, gameId, applyRemoteAction)

        isReady.value = true
    }

    // ── TEARDOWN ────────────────────────────────────────────────────────────────

    async function teardown() {
        if (channel.value) {
            await leaveGameChannel(supabase, channel.value)
            channel.value = null
        }
        isReady.value = false
    }

    return {
        isReady,
        localPlayerId,
        setup,
        dispatch,
        teardown,
    }
}