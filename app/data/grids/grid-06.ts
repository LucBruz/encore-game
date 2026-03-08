import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_06_CELLS: [ColorKey, boolean][] = [
    // Row 0
    ['g', true],  ['g', false], ['y', false], ['y', false], ['b', false], ['b', false], ['p', false], ['g', false], ['g', false], ['p', false], ['p', false], ['o', false], ['o', false], ['b', true],  ['b', false],
    // Row 1
    ['b', false], ['b', false], ['g', true],  ['g', false], ['p', false], ['p', true],  ['y', false], ['y', false], ['o', false], ['g', false], ['g', false], ['p', false], ['p', false], ['y', false], ['y', false],
    // Row 2
    ['p', false], ['p', true],  ['o', false], ['o', false], ['y', false], ['y', false], ['b', false], ['b', true],  ['p', false], ['p', false], ['y', false], ['y', false], ['g', false], ['g', false], ['o', false],
    // Row 3
    ['y', false], ['y', false], ['b', true],  ['b', false], ['g', false], ['g', false], ['o', true],  ['o', false], ['y', false], ['b', false], ['b', false], ['g', false], ['g', false], ['p', false], ['p', false],
    // Row 4
    ['o', false], ['o', false], ['p', false], ['p', false], ['o', true],  ['b', false], ['g', false], ['p', false], ['b', false], ['o', false], ['o', false], ['b', false], ['y', false], ['y', false], ['g', false],
    // Row 5
    ['g', false], ['g', false], ['y', true],  ['y', false], ['b', false], ['o', false], ['p', false], ['g', false], ['y', false], ['y', true],  ['p', false], ['p', false], ['o', false], ['o', false], ['b', false],
    // Row 6
    ['b', true],  ['b', false], ['p', false], ['p', false], ['g', false], ['g', true],  ['y', false], ['b', false], ['o', false], ['o', false], ['g', false], ['y', false], ['b', false], ['p', false], ['p', false],
]

export const GRID_06 = {
    id: '06',
    cells: GRID_06_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
