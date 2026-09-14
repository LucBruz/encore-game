import { COLS } from '../app/data/grids/grid-01'
import { maskFromSet } from '../engine/mask'
import { legalMoves } from '../engine/state'
import type { Sheet } from '../engine/state'
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

    /*
     * Cases de la grille, copiees UNE fois hors de la reactivite du store.
     *
     * `store.grid.cells` est un proxy reactif Pinia : chaque lecture de case y
     * passe par le suivi de reactivite de Vue. Les deroulements lisent des cases
     * des millions de fois. Mesure faite sur une meme decision, memes graines :
     * 30,6 s avec le proxy, 2,0 s avec une copie brute, verdict identique. C'est
     * ce qui rendait la page de review quinze fois plus lente que les scripts,
     * qui lisent `ALL_GRIDS` directement.
     */
    let plainCells: [ColorKey, boolean][] | null = null
    const cellsOf = () => (plainCells ??= store.grid.cells.map((c: any) => [c[0], c[1]] as [ColorKey, boolean]))

    const sheetOf = (player: any): Sheet => ({
        mask: maskFromSet(player.checkedCells),
        jokersUsed: player.jokersUsed,
    })

    /*
     * Conversion des bonus, store -> moteur. Les deux representations different
     * sur deux points, et les ignorer coute cher :
     *
     *   - le store garde une entree par couleur et par colonne, a `null` tant
     *     qu'elle n'est pas acquise ; le moteur n'attend que les acquises. Or
     *     `scorePlayer` compte `v === 'first' ? 5 : 3`, si bien qu'un `null`
     *     rapporterait 3 points. Silencieux, et faux dans toutes les analyses.
     *   - le store indexe les colonnes par LETTRE, le moteur par index. Passer
     *     une lettre donne `COLUMN_POINTS[undefined]` et fait tout planter.
     *
     * Le plantage a ete vu tout de suite ; les 3 points fantomes ne se seraient
     * jamais vus.
     */
    const colorBonusOf = (player: any): Partial<Record<ColorKey, 'first' | 'others'>> => {
        const out: Partial<Record<ColorKey, 'first' | 'others'>> = {}
        for (const [key, value] of Object.entries(player.colorBonus ?? {})) {
            if (value === 'first' || value === 'others') out[key as ColorKey] = value
        }
        return out
    }

    const columnBonusOf = (player: any): Record<number, 'first' | 'others'> => {
        const out: Record<number, 'first' | 'others'> = {}
        for (const [letter, value] of Object.entries(player.columnBonus ?? {})) {
            if (value !== 'first' && value !== 'others') continue
            const index = COLS.indexOf(letter as typeof COLS[number])
            if (index !== -1) out[index] = value
        }
        return out
    }

    /** Photographie de la table, telle que le joueur la voyait. */
    function snapshot(playerId: string) {
        const seat = seatOf(playerId)
        if (seat === -1) return null
        const players = store.players.map((p: any) => ({
            name: p.name,
            sheet: sheetOf(p),
            colorBonus: colorBonusOf(p),
            columnBonus: columnBonusOf(p),
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
            cellsOf(),
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
                cells: cellsOf(),
                players,
                seat,
                turn: store.turnNumber,
                // `null` represente le passe volontaire, qui est un choix reel.
                candidates: [...moves, null],
            },
        }
    }

    const toDecision = (p: Pending): ReplayedDecision => ({
        ...p.position,
        played: {
            color: p.color,
            count: p.count,
            jokersSpent: p.jokersSpent,
            placement: [...p.placement],
            colorDieIndex: p.colorDieIndex,
            numberDieIndex: p.numberDieIndex,
        },
        playerId: p.playerId,
        playerName: p.playerName,
    })

    events.forEach((event, i) => {
        const type = event.event_type as GameActionType
        const payload = event.payload ?? {}

        /*
         * `nextTurn` valide une selection complete restee en attente. Les
         * journaux anterieurs a la correction de fin de tour en sont pleins : le
         * tour s'achevait avant que le joueur actif ait valide, et son coup n'a
         * jamais eu de CONFIRM_PLACEMENT. Mesure sur la partie FZFS1D : presque
         * tous les tours actifs de l'humain manquaient a l'analyse. Un coup est
         * donc aussi clos par NEXT_TURN, s'il a effectivement ete coche.
         */
        if (type === 'NEXT_TURN') {
            const turnBefore = store.turnNumber
            applyGameAction(store, type, payload)
            for (const [playerId, p] of pending) {
                const player = store.players[seatOf(playerId)]
                if (p.placement.length > 0 && player && p.placement.every(idx => player.checkedCells.has(idx))) {
                    decisions.push(toDecision(p))
                    pending.delete(playerId)
                }
            }
            // Un NEXT_TURN ignore laisse les combos ouvertes : la partie FZFS1D
            // finit sur GAME_OVER, NEXT_TURN — que `nextTurn` refuse, partie
            // terminee — puis le CONFIRM_PLACEMENT du dernier coup. Vider ici
            // perdait ce coup.
            if (store.turnNumber !== turnBefore) pending.clear()
            opts.onProgress?.(i + 1, events.length)
            return
        }

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

            // Un passe est une decision complete a lui seul, et clot la combo
            // qu'il abandonne : elle ne doit pas etre comptee en plus.
            if (snap && playerId) {
                decisions.push({
                    ...snap.position,
                    played: null,
                    playerId,
                    playerName: store.players[snap.seat].name,
                })
            }
            if (playerId) pending.delete(playerId)
            applyGameAction(store, type, payload)
            opts.onProgress?.(i + 1, events.length)
            return
        }

        if (type === 'TOGGLE_CELL' || type === 'CANCEL_PLACEMENT') {
            applyGameAction(store, type, payload)
            // La selection est relue dans le store plutot que recalculee a cote :
            // un clic refuse (mauvaise couleur, case hors placement) n'y entre
            // pas, et une annulation la vide sans clore le coup — le joueur peut
            // encore choisir d'autres cases puis valider.
            const playerId = payload.playerId as string
            const p = pending.get(playerId)
            const player = store.players[seatOf(playerId)]
            if (p && player) p.placement = [...player.pendingCells]
            return
        }

        if (type === 'CONFIRM_PLACEMENT') {
            const playerId = payload.playerId as string
            const p = pending.get(playerId)
            // La selection est lue AVANT d'appliquer : la validation la vide.
            const committed = p ? toDecision(p) : null
            applyGameAction(store, type, payload)
            // Un placement refuse par le store n'est pas un coup joue.
            const player = store.players[seatOf(playerId)]
            if (committed && committed.played!.placement.length > 0 && player?.hasPlaced
                && committed.played!.placement.every(idx => player.checkedCells.has(idx))) {
                decisions.push(committed)
                pending.delete(playerId)
            }
            opts.onProgress?.(i + 1, events.length)
            return
        }

        applyGameAction(store, type, payload)
    })

    return decisions
}
