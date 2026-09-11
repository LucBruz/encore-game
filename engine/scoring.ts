import { COLUMN_POINTS, COLS } from '../app/data/grids/grid-01'
import { CELL_COUNT, GRID_COLS, GRID_ROWS } from './grid'
import type { Cells, CheckedMask, ColorKey } from './types'

export const COLOR_KEYS: readonly ColorKey[] = ['g', 'y', 'b', 'p', 'o']

/**
 * Qui marque les points d'une colonne ou d'une couleur.
 *
 * En vrai jeu, "first" et "others" dependent des adversaires. L'entrainement et
 * l'evaluation sont mono-agent : il n'y a pas d'adversaire, donc le mode doit etre
 * choisi explicitement. Un agent entraine en 'first' surevalue la course aux
 * colonnes quand on le remet dans une vraie partie a deux ; 'average' est le
 * compromis raisonnable a deux joueurs. Le mode retenu est toujours reporte avec
 * les scores, sinon les chiffres ne sont comparables a rien.
 */
export type BonusMode = 'first' | 'others' | 'average'

export interface ScoreBreakdown {
    colorBonus: number
    columnBonus: number
    jokersLeft: number
    starMalus: number
    total: number
}

/** Nombre de cases de chaque couleur dans une grille. */
export function colorTotals(cells: Cells): Record<ColorKey, number> {
    const totals: Record<ColorKey, number> = { g: 0, y: 0, b: 0, p: 0, o: 0 }
    for (let i = 0; i < CELL_COUNT; i++) totals[cells[i][0]]++
    return totals
}

/** Cases cochees de chaque couleur. */
export function colorChecked(cells: Cells, mask: CheckedMask): Record<ColorKey, number> {
    const checked: Record<ColorKey, number> = { g: 0, y: 0, b: 0, p: 0, o: 0 }
    for (let i = 0; i < CELL_COUNT; i++) if (mask[i]) checked[cells[i][0]]++
    return checked
}

export function completedColors(cells: Cells, mask: CheckedMask): ColorKey[] {
    const totals = colorTotals(cells)
    const checked = colorChecked(cells, mask)
    return COLOR_KEYS.filter(c => totals[c] > 0 && checked[c] === totals[c])
}

/** Indices (0-14) des colonnes entierement cochees. */
export function completedColumns(mask: CheckedMask): number[] {
    const out: number[] = []
    for (let col = 0; col < GRID_COLS; col++) {
        let full = true
        for (let row = 0; row < GRID_ROWS; row++) {
            if (!mask[row * GRID_COLS + col]) { full = false; break }
        }
        if (full) out.push(col)
    }
    return out
}

function columnValue(col: number, mode: BonusMode): number {
    const points = COLUMN_POINTS[COLS[col]]
    if (mode === 'first') return points.first
    if (mode === 'others') return points.others
    return (points.first + points.others) / 2
}

function colorValue(mode: BonusMode): number {
    if (mode === 'first') return 5
    if (mode === 'others') return 3
    return 4
}

export interface ScoreOptions {
    /** Partie terminee : le malus etoiles ne s'applique qu'a ce moment-la. */
    gameOver?: boolean
    mode?: BonusMode
    totalJokers?: number
}

export function scoreSheet(
    cells: Cells,
    mask: CheckedMask,
    jokersUsed: number,
    opts: ScoreOptions = {},
): ScoreBreakdown {
    const mode = opts.mode ?? 'average'
    const totalJokers = opts.totalJokers ?? 8

    const colorBonus = completedColors(cells, mask).length * colorValue(mode)
    const columnBonus = completedColumns(mask).reduce((sum, col) => sum + columnValue(col, mode), 0)
    const jokersLeft = Math.max(0, totalJokers - jokersUsed)

    let starMalus = 0
    if (opts.gameOver) {
        for (let i = 0; i < CELL_COUNT; i++) {
            if (cells[i][1] && !mask[i]) starMalus += 2
        }
    }

    return {
        colorBonus,
        columnBonus,
        jokersLeft,
        starMalus,
        total: colorBonus + columnBonus + jokersLeft - starMalus,
    }
}

/** La partie s'arrete des qu'un joueur a complete deux couleurs. */
export function hasTwoCompletedColors(cells: Cells, mask: CheckedMask): boolean {
    return completedColors(cells, mask).length >= 2
}
