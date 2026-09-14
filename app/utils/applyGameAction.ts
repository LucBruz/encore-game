import type { GameActionType } from '~/services/realtimeService'
import type { useGameStore } from '~/stores/gameStore'

type GameStore = ReturnType<typeof useGameStore>

/**
 * Applique une action de jeu a un store, sans reseau.
 *
 * Extrait de `Usegamesync` pour avoir UNE seule implementation : la synchro
 * multijoueur l'utilise pour appliquer les actions locales et distantes, et
 * l'analyse d'apres-partie l'utilise pour rejouer `game_events` dans un store
 * neuf. Deux copies de cette logique divergeraient, et l'analyse jugerait alors
 * des positions que la partie n'a jamais connues.
 */
export function applyGameAction(
    store: GameStore,
    type: GameActionType,
    payload: Record<string, unknown>,
) {
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
                activePlayer.passReason = (payload.reason as any) ?? 'manual'
            }
            store.passReason = (payload.reason as any) ?? 'manual'
            store.activeSelection = null
            if ((store.phase as string) === 'active_selecting') {
                store.phase = 'passive_selecting'
            }
            break
        }
        case 'PASS_PASSIVE':
        case 'TIMER_EXPIRED':
            store.passPassiveTurn(payload.playerId as string, (payload.reason as any) ?? 'manual')
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
            // Journaux anterieurs a la correction de fin de tour : le tour
            // s'achevait des que les PASSIFS avaient fini, sans attendre le
            // placement de l'actif, et NEXT_TURN partait dans cet etat. Le store
            // corrige n'y voit plus une fin de tour et ignorerait l'evenement :
            // tout le reste de la partie se rejouerait alors de travers, a la
            // reconnexion comme dans l'analyse. On accepte donc NEXT_TURN dans
            // l'etat exact ou l'ancienne regle l'emettait. Un client a jour ne
            // l'emet jamais la, puisqu'il attend `turn_end`.
            if (
                store.phase === 'passive_selecting'
                && !store.isFirstThreeTurns
                && store.players.every(p => p.id === store.activePlayerId || p.hasPlaced || p.hasPassed)
            ) {
                store.flushPendingAnimations()
                store.phase = 'turn_end'
            }
            store.nextTurn()
            break
        case 'GAME_OVER':
            store.setGameOver()
            break
    }
}
