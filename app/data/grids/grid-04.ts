import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_04_CELLS: [ColorKey, boolean][] = [
    // Row 0
    ['b', false], ['b', false], ['b', true],  ['y', false], ['y', false], ['y', true],  ['g', false], ['g', false], ['g', false], ['y', false], ['y', false], ['y', false], ['o', true],  ['o', false], ['o', false],
    // Row 1
    ['b', true],  ['b', false], ['o', false], ['o', false], ['y', false], ['y', true],  ['b', false], ['b', false], ['g', false], ['g', false], ['o', false], ['o', false], ['p', false], ['p', false], ['y', false],
    // Row 2
    ['y', false], ['y', false], ['o', true],  ['b', false], ['b', false], ['g', false], ['g', false], ['b', true],  ['o', false], ['o', false], ['g', false], ['g', false], ['b', false], ['b', false], ['p', false],
    // Row 3
    ['o', false], ['o', false], ['y', false], ['y', false], ['p', true],  ['b', false], ['b', false], ['g', false], ['o', false], ['o', false], ['y', false], ['y', false], ['b', true],  ['b', false], ['o', false],
    // Row 4
    ['g', true],  ['g', false], ['p', false], ['p', false], ['o', false], ['b', false], ['b', false], ['y', true],  ['b', false], ['p', false], ['p', false], ['o', false], ['g', false], ['g', false], ['g', false],
    // Row 5
    ['p', false], ['p', false], ['g', false], ['g', true],  ['o', false], ['o', false], ['b', false], ['y', false], ['p', false], ['p', false], ['b', false], ['b', false], ['y', false], ['y', false], ['b', false],
    // Row 6
    ['o', false], ['o', false], ['y', false], ['y', false], ['b', true],  ['b', false], ['p', false], ['p', false], ['g', false], ['g', true],  ['o', false], ['o', false], ['p', false], ['p', false], ['b', false],
]

export const GRID_04 = {
    id: '04',
    cells: GRID_04_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
