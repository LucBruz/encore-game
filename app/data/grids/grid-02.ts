import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_02_CELLS: [ColorKey, boolean][] = [
    // Row 0
    ['g', true],  ['g', false], ['g', false], ['o', false], ['o', false], ['o', false], ['p', true],  ['b', false], ['b', false], ['y', true],  ['y', false], ['y', false], ['o', false], ['o', false], ['o', false],
    // Row 1
    ['y', true],  ['y', false], ['b', false], ['b', false], ['g', true],  ['g', false], ['g', false], ['o', false], ['o', false], ['b', false], ['b', false], ['g', false], ['g', false], ['p', true],  ['p', false],
    // Row 2
    ['y', false], ['y', false], ['y', true],  ['b', false], ['b', false], ['g', false], ['y', true],  ['y', false], ['p', false], ['p', false], ['o', false], ['o', false], ['b', false], ['b', false], ['p', false],
    // Row 3
    ['o', false], ['o', false], ['o', false], ['o', false], ['b', false], ['b', false], ['o', false], ['p', true],  ['o', false], ['o', false], ['b', false], ['b', false], ['o', false], ['p', false], ['p', false],
    // Row 4
    ['p', false], ['p', false], ['g', false], ['g', false], ['g', true],  ['p', false], ['p', false], ['b', false], ['y', true],  ['y', false], ['p', false], ['p', false], ['g', false], ['g', false], ['g', false],
    // Row 5
    ['b', false], ['b', false], ['p', false], ['p', false], ['o', false], ['o', false], ['b', true],  ['y', true],  ['g', false], ['g', false], ['y', false], ['y', false], ['p', false], ['p', false], ['b', false],
    // Row 6
    ['g', false], ['g', false], ['o', true],  ['o', false], ['p', false], ['p', false], ['p', false], ['b', false], ['g', false], ['g', false], ['g', false], ['b', true],  ['b', false], ['y', false], ['y', false],
]

export const GRID_02 = {
    id: '02',
    cells: GRID_02_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
