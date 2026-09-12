import { maskFromSet } from '../engine/mask'
import { legalMoves } from '../engine/state'
import type { Move, Sheet } from '../engine/state'
import type { ColorKey } from '../engine/types'
import { applyGameAction } from '../app/utils/applyGameAction'
import type { GameActionType } from '../app/services/realtimeService'
import type { DecisionPosition } from './evaluate'

type GameStore = any

export interface GameEvent {
    event_type: string
    payload: Record<string, unknown>
}

export interface ReplayedDecision extends DecisionPosition {
    playerId: string
    playerName: string
}

const DECIDES = new Set(['CONFIRM_ACTIVE', 'CONFIRM_PASSIVE', 'PASS_ACTIVE', 'PASS_PASSIVE', 'TIMER_EXPIRED'])

/**
 * Rejoue `game_events` dans un store neuf et en extrait les positions de
 * decision.
 *
 * Le rejeu passe par `applyGameAction`, la meme fonction que la synchro
 * multijoueur. C'est essentiel : une seconde implementation des regles
 * divergerait, et l'analyse jugerait alors des positions que la partie n'a
 * jamais connues.
 *
 * Le journal ne contient pas de coups, il contient des evenements. Un coup se
 * reconstruit sur plusieurs d'entre eux : la combo confirmee donne la couleur et
 * le nombre, les TOGGLE_CELL qui suivent donnent le placement, et
 * CONFIRM_PLACEMENT le termine. On photographie donc la position AVANT la
 * confirmation de combo — c'est la que le joueur decidait — et on n'emet la
 * decision qu'une fois le placement connu.
 *
 * Cet ordre n'etait pas garanti avant que les ecritures ne soient serialisees
 * (voir `persistQueue` dans Usegamesync) : des evenements intervertis
 * produisaient un plateau different au rejeu. Les parties anterieures a ce
 * correctif peuvent donc etre inanalysables, et c'est detectable — une
 * decision dont le placement est vide.
 */
export function replayDecisions(
    store: GameStore,
    events: GameEvent[],
    opts: { onProgress?: (done: number, total: number) => void } = {},
): ReplayedDecision[] {
    const decisions: ReplayedDecision[] = []

    // Decision en cours de construction, par joueur : la combo est connue avant
    // le placement.
    interface Pending {
        position: Omit<DecisionPosition, 'played'>
        playerId: string
        playerName: string
        color: ColorKey
        count: number
        colorDieIndex: number
        numberDieIndex: number
        jokersSpent: number
        placement: number[]
    }
    const pending = new Map<string, Pending>()

    const seatOf = (playerId: string) => store.players.findIndex((p: any) => p.id === playerId)

    const sheetOf = (player: any): Sheet => ({
        mask: maskFromSet(player.checkedCells),
        jokersUsed: player.jokersUsed,
    })

    /** Photographie de la table, telle que le joueur la voyait. */
    function snapshot(playerId: string) {
        const seat = seatOf(playerId)
        if (seat === -1) return null
        const players = store.players.map((p: any) => ({
            name: p.name,
            sheet: sheetOf(p),
            colorBonus: { ...p.colorBonus },
            columnBonus: { ...p.columnBonus },
        }))

        // Des disponibles pour CE joueur : les six pendant les trois premiers
        // tours et pour le joueur actif, les quatre restants sinon. C'est le
        // getter du store qui fait foi, pas une reimplementation.
        const isActive = playerId === store.activePlayerId
        const pool = (isActive || store.isFirstThreeTurns)
            ? store.currentRoll
            : store.availableForPassive
        if (!pool) return null

        // Le store garde les des comme objets `{ type, value }` ; le moteur veut
        // les faces nues. Sans cette conversion, aucun coup n'est trouve legal.
        const moves = legalMoves(
            store.grid.cells,
            players[seat].sheet,
            {
                colors: pool.colorDices.map((d: any) => d.value),
                numbers: pool.numberDices.map((d: any) => d.value),
            },
            { totalJokers: store.grid.jokers },
        )

        return {
            seat,
            position: {
                cells: store.grid.cells,
                players,
                seat,
                turn: store.turnNumber,
                // `null` represente le passe volontaire, qui est un choix reel.
                candidates: [...moves, null],
            },
        }
    }

    events.forEach((event, i) => {
        const type = event.event_type as GameActionType
        const payload = event.payload ?? {}

        if (DECIDES.has(type)) {
            const playerId = (payload.playerId as string)
                ?? (type === 'CONFIRM_ACTIVE' || type === 'PASS_ACTIVE' ? store.activePlayerId : null)
            const snap = playerId ? snapshot(playerId) : null

            if (snap && (type === 'CONFIRM_ACTIVE' || type === 'CONFIRM_PASSIVE')) {
                const player = store.players[snap.seat]
                const before = player.jokersUsed
                applyGameAction(store, type, payload)
                const combo = player.confirmedCombo
                if (combo) {
                    pending.set(playerId!, {
                        position: snap.position,
                        playerId: playerId!,
                        playerName: player.name,
                        color: combo.color,
                        count: combo.count,
                        colorDieIndex: payload.colorDiceIndex as number,
                        numberDieIndex: payload.numberDiceIndex as number,
                        jokersSpent: Math.max(0, player.jokersUsed - before),
                        placement: [],
                    })
                }
                return
            }

            // Un passe est une decision complete a lui seul.
            if (snap && playerId) {
                decisions.push({
                    ...snap.position,
                    played: null,
                    playerId,
                    playerName: store.players[snap.seat].name,
                })
            }
            applyGameAction(store, type, payload)
            opts.onProgress?.(i + 1, events.length)
            return
        }

        if (type === 'TOGGLE_CELL') {
            const playerId = payload.playerId as string
            const p = pending.get(playerId)
            const idx = payload.cellIdx as number
            if (p) {
                // Un second clic sur la meme case la deselectionne.
                const at = p.placement.indexOf(idx)
                if (at === -1) p.placement.push(idx); else p.placement.splice(at, 1)
            }
            applyGameAction(store, type, payload)
            return
        }

        if (type === 'CONFIRM_PLACEMENT') {
            const playerId = payload.playerId as string
            const p = pending.get(playerId)
            if (p && p.placement.length > 0) {
                const played: Move = {
                    color: p.color,
                    count: p.count,
                    jokersSpent: p.jokersSpent,
                    placement: [...p.placement],
                    colorDieIndex: p.colorDieIndex,
                    numberDieIndex: p.numberDieIndex,
                }
                decisions.push({
                    ...p.position,
                    played,
                    playerId: p.playerId,
                    playerName: p.playerName,
                })
            }
            pending.delete(playerId)
            applyGameAction(store, type, payload)
            opts.onProgress?.(i + 1, events.length)
            return
        }

        if (type === 'CANCEL_PLACEMENT') {
            pending.delete(payload.playerId as string)
        }

        applyGameAction(store, type, payload)
    })

    return decisions
}
