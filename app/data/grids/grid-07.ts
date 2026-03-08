import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_07_CELLS: [ColorKey, boolean][] = [
    // Row 0
    ['g', true],  ['g', false], ['y', false], ['y', false], ['p', false], ['p', true],  ['b', false], ['y', false], ['b', false], ['b', false], ['y', true],  ['o', false], ['o', false], ['g', false], ['g', false],
    // Row 1
    ['y', false], ['y', true],  ['g', false], ['g', false], ['b', false], ['b', false], ['y', true],  ['p', false], ['p', false], ['g', false], ['g', false], ['b', false], ['b', false], ['o', false], ['o', false],
    // Row 2
    ['p', false], ['p', false], ['b', true],  ['b', false], ['g', false], ['g', false], ['p', false], ['b', false], ['o', false], ['o', false], ['p', false], ['p', false], ['y', false], ['y', false], ['b', false],
    // Row 3
    ['b', false], ['b', false], ['o', false], ['o', true],  ['p', false], ['p', false], ['g', false], ['y', false], ['y', false], ['b', false], ['b', false], ['g', true],  ['g', false], ['p', false], ['p', false],
    // Row 4
    ['o', true],  ['o', false], ['y', false], ['y', false], ['o', false], ['g', false], ['g', true],  ['p', false], ['g', false], ['y', false], ['y', false], ['p', false], ['o', false], ['b', false], ['b', false],
    // Row 5
    ['g', false], ['g', false], ['p', true],  ['p', false], ['y', false], ['y', false], ['o', false], ['o', false], ['b', false], ['b', false], ['p', false], ['p', false], ['g', false], ['o', true],  ['o', false],
    // Row 6
    ['p', false], ['p', false], ['g', false], ['g', true],  ['b', false], ['b', false], ['y', false], ['g', false], ['p', false], ['p', true],  ['o', false], ['o', false], ['b', false], ['y', false], ['y', false],
]

export const GRID_07 = {
    id: '07',
    cells: GRID_07_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
