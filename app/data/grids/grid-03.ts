import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_03_CELLS: [ColorKey, boolean][] = [
    // Row 0
    ['g', false], ['g', true],  ['g', false], ['y', false], ['y', false], ['y', true],  ['b', false], ['b', false], ['b', false], ['y', false], ['y', false], ['y', false], ['g', true],  ['g', false], ['g', false],
    // Row 1
    ['g', true],  ['y', false], ['y', false], ['p', false], ['p', true],  ['b', false], ['b', false], ['y', false], ['y', false], ['o', false], ['o', false], ['b', false], ['b', false], ['g', false], ['o', false],
    // Row 2
    ['p', true],  ['p', false], ['b', false], ['b', false], ['y', false], ['y', true],  ['y', false], ['p', false], ['g', false], ['g', false], ['b', false], ['b', false], ['o', false], ['o', false], ['y', false],
    // Row 3
    ['o', false], ['o', true],  ['p', false], ['p', false], ['o', false], ['o', false], ['g', true],  ['g', false], ['o', false], ['p', false], ['p', false], ['g', false], ['g', false], ['b', false], ['b', false],
    // Row 4
    ['b', false], ['b', false], ['o', false], ['o', false], ['g', false], ['g', false], ['p', false], ['o', false], ['b', true],  ['b', false], ['y', false], ['y', false], ['p', false], ['p', false], ['o', false],
    // Row 5
    ['y', false], ['y', true],  ['g', false], ['g', false], ['b', false], ['b', true],  ['o', false], ['y', false], ['p', false], ['p', false], ['g', false], ['g', false], ['y', false], ['y', false], ['b', false],
    // Row 6
    ['p', false], ['p', false], ['y', true],  ['y', false], ['o', false], ['o', false], ['b', false], ['b', false], ['g', false], ['g', true],  ['p', false], ['p', false], ['o', false], ['b', false], ['b', false],
]

export const GRID_03 = {
    id: '03',
    cells: GRID_03_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
