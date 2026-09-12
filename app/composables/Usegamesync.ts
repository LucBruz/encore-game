import { ref } from 'vue'
import { useGameStore } from '~/stores/gameStore'
import type { LobbyPlayer } from '~/stores/lobbyStore'
import {
    joinGameChannel,
    sendAction,
    leaveGameChannel,
} from '~/services/realtimeService'
import type { GameActionType, GameAction } from '~/services/realtimeService'
import { applyGameAction } from '~/utils/applyGameAction'

/**
 * File d'attente des ecritures dans `game_events`.
 *
 * Les inserts etaient emis sans etre attendus ni serialises. Or `replayEvents`
 * rejoue les evenements dans l'ordre de `created_at`, c'est-a-dire dans l'ordre
 * ou les inserts se terminent : deux inserts concurrents qui se doublent
 * suffisent a reconstruire un plateau different a la reconnexion.
 *
 * Mesure faite sur une vraie partie : le tour 0 d'un bot a ete persiste dans
 * l'ordre TOGGLE, TOGGLE, CONFIRM_PASSIVE, CONFIRM_PLACEMENT, TOGGLE — alors
 * que la combo est confirmee avant les cases. Rejoue, ce tour donnait 5 cases
 * cochees au lieu de 7.
 *
 * Un humain clique trop lentement pour declencher la course ; un bot place cinq
 * cases en une dizaine de millisecondes. Le chainage garantit qu'un insert n'est
 * emis qu'une fois le precedent termine. Il est au niveau du module, donc
 * partage par toutes les instances du composable.
 */
let persistQueue: Promise<unknown> = Promise.resolve()

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
    const applyToStore = (type: GameActionType, payload: Record<string, unknown>) =>
        applyGameAction(store, type, payload)

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

        // 3. Persister dans game_events, en arriere-plan mais DANS L'ORDRE.
        //    Le numero de tour est fige maintenant : au moment ou l'insert
        //    partira, le store aura pu changer de tour.
        if (store.gameId) {
            const row = {
                game_id: store.gameId as string,
                turn_number: store.turnNumber,
                player_id: localPlayerId.value,
                event_type: type,
                payload: payload as any,
            }
            persistQueue = persistQueue
                .then(() => supabase.from('game_events').insert(row))
                .then((result: any) => {
                    if (result?.error) {
                        console.warn('[GameSync] Erreur persistance event:', result.error.message)
                    }
                })
                // Une ecriture qui echoue ne doit pas rompre la file : les
                // evenements suivants doivent continuer a partir, dans l'ordre.
                .catch(err => {
                    console.warn('[GameSync] Erreur persistance event:', err?.message ?? err)
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