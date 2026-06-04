// ─── Types ────────────────────────────────────────────────────────────────────

export type GameActionType =
    | 'ROLL_DICES'
    | 'CONFIRM_ACTIVE'
    | 'CONFIRM_PASSIVE'
    | 'PASS_ACTIVE'
    | 'PASS_PASSIVE'
    | 'TOGGLE_CELL'
    | 'CONFIRM_PLACEMENT'
    | 'CANCEL_PLACEMENT'
    | 'USE_JOKER'
    | 'NEXT_TURN'
    | 'TIMER_EXPIRED'
    | 'GAME_OVER'

export interface GameAction {
    type: GameActionType
    senderId: string       // playerId émetteur — pour éviter de rejouer ses propres actions
    payload: Record<string, unknown>
}

// ─── Fonctions ────────────────────────────────────────────────────────────────

/**
 * Rejoint le canal Realtime d'une partie et écoute les actions entrantes.
 * Le client Supabase est passé en paramètre car ce service est appelé
 * hors contexte composant (depuis un composable).
 */
export function joinGameChannel(
    supabase: any,
    gameId: string,
    onAction: (action: GameAction) => void
): any {
    const channel = supabase
        .channel(`game:${gameId}`)
        .on('broadcast', { event: 'game_action' }, ({ payload }: { payload: GameAction }) => {
            onAction(payload)
        })
        .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
                console.log(`[Realtime] Connecté au canal game:${gameId}`)
            } else if (status === 'CHANNEL_ERROR') {
                console.error(`[Realtime] Erreur canal game:${gameId}`)
            }
        })

    return channel
}

/**
 * Envoie une action à tous les joueurs du canal.
 * Fire-and-forget — pas de await nécessaire en usage normal.
 */
export function sendAction(
    channel: any,
    action: GameAction
): void {
    channel
        .send({
            type: 'broadcast',
            event: 'game_action',
            payload: action,
        })
        .catch((err: unknown) => {
            console.error('[Realtime] Erreur envoi action:', err)
        })
}

/**
 * Quitte proprement le canal Realtime.
 * À await lors du teardown pour éviter les canaux zombies.
 */
export async function leaveGameChannel(
    supabase: any,
    channel: any
): Promise<void> {
    await supabase.removeChannel(channel)
    console.log('[Realtime] Canal quitté')
}