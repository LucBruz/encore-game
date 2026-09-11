import type { ColorKey } from '../app/data/grids/grid-01'

export type { ColorKey }

/** Grille : 105 entrées [couleur, étoile], ordre ligne par ligne. */
export type Cells = readonly (readonly [ColorKey, boolean])[]

/** Masque des cases cochées : 1 octet par case, 105 octets. */
export type CheckedMask = Uint8Array

/** Combinaison dé couleur + dé chiffré, jokers déjà résolus. */
export interface Combo {
    color: ColorKey
    count: number
}

/** Ensemble de cases cochées en un seul coup. */
export type Placement = readonly number[]

export interface PlacementValidation {
    valid: boolean
    reason?: string
}
