import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_08_CELLS: [ColorKey, boolean][] = [
    // Row 0
    ['p', true],  ['p', false], ['g', false], ['g', false], ['g', true],  ['b', false], ['b', false], ['y', false], ['b', false], ['b', false], ['y', true],  ['o', false], ['o', false], ['g', false], ['g', false],
    // Row 1
    ['g', false], ['g', true],  ['b', false], ['b', false], ['o', false], ['o', false], ['p', true],  ['p', false], ['g', false], ['g', false], ['b', false], ['b', false], ['o', false], ['o', false], ['p', false],
    // Row 2
    ['o', false], ['o', false], ['p', true],  ['p', false], ['y', false], ['y', false], ['o', false], ['b', false], ['p', false], ['p', true],  ['g', false], ['g', false], ['y', false], ['y', false], ['b', false],
    // Row 3
    ['b', false], ['b', false], ['g', false], ['g', true],  ['p', false], ['p', false], ['y', false], ['o', false], ['y', false], ['g', false], ['g', false], ['p', false], ['b', false], ['b', false], ['o', false],
    // Row 4
    ['y', true],  ['y', false], ['o', false], ['o', false], ['b', false], ['b', false], ['g', false], ['p', false], ['o', true],  ['o', false], ['p', false], ['p', false], ['b', false], ['g', false], ['g', false],
    // Row 5
    ['p', false], ['p', false], ['y', false], ['y', true],  ['g', false], ['g', false], ['b', true],  ['y', false], ['b', false], ['b', false], ['o', false], ['o', false], ['p', false], ['p', false], ['y', false],
    // Row 6
    ['g', false], ['g', false], ['b', false], ['b', true],  ['o', false], ['o', false], ['p', false], ['g', true],  ['y', false], ['y', false], ['b', false], ['p', false], ['p', false], ['o', false], ['o', false],
]

export const GRID_08 = {
    id: '08',
    cells: GRID_08_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
