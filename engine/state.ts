import type { ColorFace, NumberFace, Roll } from './dice'
import { cloneMask, createMask } from './mask'
import { MAX_COUNT, MIN_COUNT, legalPlacements } from './placement'
import { COLOR_KEYS, hasTwoCompletedColors } from './scoring'
import type { Cells, CheckedMask, ColorKey } from './types'

export const DEFAULT_TOTAL_JOKERS = 8

/** Feuille d'un joueur : donnee pure, clonable, sans dependance a Vue ou Pinia. */
export interface Sheet {
    mask: CheckedMask
    jokersUsed: number
}

export function createSheet(): Sheet {
    return { mask: createMask(), jokersUsed: 0 }
}

export function cloneSheet(sheet: Sheet): Sheet {
    return { mask: cloneMask(sheet.mask), jokersUsed: sheet.jokersUsed }
}

/** Un coup jouable : la combo choisie, les jokers qu'elle coute, et ou l'on coche. */
export interface Move {
    color: ColorKey
    count: number
    jokersSpent: number
    placement: readonly number[]
    colorDieIndex: number
    numberDieIndex: number
}

export interface MoveOptions {
    totalJokers?: number
}

/**
 * Tous les coups legaux pour un lancer donne, cadrage mono-agent : le joueur
 * choisit librement un de couleur parmi 3 et un de chiffre parmi 3. Le refus de
 * des entre joueurs est ignore — le couplage entre feuilles est faible dans
 * Encore!, et cela supprime toute la complexite multi-agent.
 *
 * Passer n'est pas represente ici : c'est le cas "aucun coup", ou un choix
 * explicite du bot quand la liste est non vide.
 */
export function legalMoves(
    cells: Cells,
    sheet: Sheet,
    roll: Roll,
    opts: MoveOptions = {},
): Move[] {
    const totalJokers = opts.totalJokers ?? DEFAULT_TOTAL_JOKERS
    const jokersLeft = totalJokers - sheet.jokersUsed
    const moves: Move[] = []

    // Une meme combo (couleur, nombre) peut etre atteignable par plusieurs paires de
    // des ; on ne l'enumere qu'une fois, en retenant la paire la moins chere en jokers.
    const cheapest = new Map<string, { jokersSpent: number; ci: number; ni: number }>()

    for (let ci = 0; ci < roll.colors.length; ci++) {
        const colorFace: ColorFace = roll.colors[ci]
        const colors: ColorKey[] = colorFace === 'joker' ? [...COLOR_KEYS] : [colorFace]

        for (let ni = 0; ni < roll.numbers.length; ni++) {
            const numberFace: NumberFace = roll.numbers[ni]
            const counts: number[] = numberFace === 'joker'
                ? [1, 2, 3, 4, 5]
                : [numberFace]

            const jokersSpent = (colorFace === 'joker' ? 1 : 0) + (numberFace === 'joker' ? 1 : 0)
            if (jokersSpent > jokersLeft) continue

            for (const color of colors) {
                for (const count of counts) {
                    if (count < MIN_COUNT || count > MAX_COUNT) continue
                    const key = `${color}:${count}`
                    const known = cheapest.get(key)
                    if (!known || jokersSpent < known.jokersSpent) {
                        cheapest.set(key, { jokersSpent, ci, ni })
                    }
                }
            }
        }
    }

    for (const [key, { jokersSpent, ci, ni }] of cheapest) {
        const [colorStr, countStr] = key.split(':')
        const color = colorStr as ColorKey
        const count = Number(countStr)
        for (const placement of legalPlacements(cells, sheet.mask, color, count)) {
            moves.push({ color, count, jokersSpent, placement, colorDieIndex: ci, numberDieIndex: ni })
        }
    }

    return moves
}

/** Applique un coup en place. Le coup doit etre legal (sortie de legalMoves). */
export function applyMove(sheet: Sheet, move: Move): void {
    for (const idx of move.placement) sheet.mask[idx] = 1
    sheet.jokersUsed += move.jokersSpent
}

export function isGameOver(cells: Cells, sheet: Sheet): boolean {
    return hasTwoCompletedColors(cells, sheet.mask)
}
