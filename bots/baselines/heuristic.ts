import { COLUMN_POINTS, COLS } from '../../app/data/grids/grid-01'
import { CELL_COUNT, GRID_COLS, GRID_ROWS } from '../../engine/grid'
import { COLOR_KEYS, gridStats } from '../../engine/scoring'
import type { GridStats } from '../../engine/scoring'
import type { Sheet } from '../../engine/state'
import { DEFAULT_TOTAL_JOKERS } from '../../engine/state'
import type { Cells, CheckedMask, ColorKey } from '../../engine/types'

/**
 * Evaluation heuristique d'une feuille, en "points esperes".
 *
 * Le score reel est presque toujours nul en debut de partie (aucune couleur ni
 * colonne complete), ce qui rend une evaluation par score brut inutilisable pour
 * un choix glouton : tous les coups vaudraient 0. On value donc la PROGRESSION,
 * de facon superlineaire, pour que remplir une colonne deja bien avancee compte
 * plus que d'en entamer une nouvelle.
 */
export interface HeuristicWeights {
    /** Exposant de la progression colonne. > 1 favorise la finition. */
    columnExponent: number
    /** Exposant de la progression couleur. */
    colorExponent: number
    /** Valeur attribuee a une couleur complete (entre 3 et 5 selon le mode de bonus). */
    colorValue: number
    /** Points gagnes en cochant une etoile (evite le malus de -2). */
    starValue: number
    /** Valeur d'un joker encore disponible. */
    jokerValue: number
    /** Petite prime par case cochee, pour departager les coups equivalents. */
    cellValue: number
}

export const DEFAULT_WEIGHTS: HeuristicWeights = {
    columnExponent: 2,
    colorExponent: 2,
    colorValue: 4,
    starValue: 2,
    jokerValue: 1,
    cellValue: 0.05,
}

/** Points de chaque colonne, en mode "average" (moyenne first/others). */
const COLUMN_VALUE: number[] = COLS.map(c => (COLUMN_POINTS[c].first + COLUMN_POINTS[c].others) / 2)

export function evaluateSheet(
    cells: Cells,
    mask: CheckedMask,
    jokersUsed: number,
    stats: GridStats,
    weights: HeuristicWeights = DEFAULT_WEIGHTS,
    totalJokers = DEFAULT_TOTAL_JOKERS,
): number {
    let value = 0

    // Colonnes : progression^exposant x valeur de la colonne.
    for (let col = 0; col < GRID_COLS; col++) {
        let checked = 0
        for (let row = 0; row < GRID_ROWS; row++) if (mask[row * GRID_COLS + col]) checked++
        if (checked === 0) continue
        const ratio = checked / GRID_ROWS
        value += COLUMN_VALUE[col] * Math.pow(ratio, weights.columnExponent)
    }

    // Couleurs : meme forme.
    const checkedByColor: Record<ColorKey, number> = { g: 0, y: 0, b: 0, p: 0, o: 0 }
    let starsChecked = 0
    let cellsChecked = 0
    for (let i = 0; i < CELL_COUNT; i++) {
        if (!mask[i]) continue
        cellsChecked++
        checkedByColor[cells[i][0]]++
        if (cells[i][1]) starsChecked++
    }
    for (const c of COLOR_KEYS) {
        const total = stats.colorTotals[c]
        if (!total) continue
        const ratio = checkedByColor[c] / total
        value += weights.colorValue * Math.pow(ratio, weights.colorExponent)
    }

    value += starsChecked * weights.starValue
    value += Math.max(0, totalJokers - jokersUsed) * weights.jokerValue
    value += cellsChecked * weights.cellValue

    return value
}

export function evaluate(
    cells: Cells,
    sheet: Sheet,
    stats: GridStats,
    weights: HeuristicWeights = DEFAULT_WEIGHTS,
    totalJokers = DEFAULT_TOTAL_JOKERS,
): number {
    return evaluateSheet(cells, sheet.mask, sheet.jokersUsed, stats, weights, totalJokers)
}

export { gridStats }
export type { GridStats }
