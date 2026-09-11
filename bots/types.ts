import type { Rng, Roll } from '../engine/dice'
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

    // ── Contexte multijoueur, absent en solitaire ────────────────────────────
    /** Le joueur met sa paire de des de cote : son choix prive les autres. */
    isActive?: boolean
    /** Lancer complet, avant retrait. Necessaire pour raisonner sur ce qui reste. */
    fullRoll?: Roll
    /** Feuilles adverses. Publiques dans le vrai jeu, donc utilisables. */
    opponents?: Sheet[]
}

export interface Bot {
    readonly name: string
    /** Renvoie le coup choisi, ou null pour passer volontairement. */
    chooseMove(ctx: TurnContext): Move | null
}
