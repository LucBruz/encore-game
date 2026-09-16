import type { Rng, Roll } from '../engine/dice'
import type { Move, Sheet } from '../engine/state'
import type { Cells, ColorKey } from '../engine/types'

/** Ce qu'un joueur a sur la table : sa feuille et les bonus deja reclames. Public. */
export interface TablePlayer {
    sheet: Sheet
    colorBonus: Partial<Record<ColorKey, 'first' | 'others'>>
    columnBonus: Record<number, 'first' | 'others'>
}

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
    /**
     * Toute la table, bonus compris, et le siege du joueur. Necessaire a un bot qui
     * simule la suite : le score final depend de qui a reclame quoi en premier, ce
     * que les feuilles seules ne disent pas. A ne pas modifier.
     */
    table?: { seat: number; players: readonly TablePlayer[] }
}

export interface Bot {
    readonly name: string
    /** Renvoie le coup choisi, ou null pour passer volontairement. */
    chooseMove(ctx: TurnContext): Move | null
}
