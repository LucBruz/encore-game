import type { Rng } from '../engine/dice'
import type { Move, Sheet } from '../engine/state'
import type { Cells } from '../engine/types'

export interface TurnContext {
    cells: Cells
    sheet: Sheet
    /** Coups legaux pour ce lancer. Vide = le joueur doit passer. */
    moves: Move[]
    turn: number
    totalJokers: number
    rng: Rng
}

export interface Bot {
    readonly name: string
    /** Renvoie le coup choisi, ou null pour passer volontairement. */
    chooseMove(ctx: TurnContext): Move | null
}
