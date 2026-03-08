import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_05_CELLS: [ColorKey, boolean][] = [
    // Row 0
    ['b', false], ['b', false], ['y', false], ['y', false], ['y', true],  ['g', false], ['g', false], ['b', false], ['b', false], ['o', false], ['o', false], ['o', true],  ['p', false], ['p', false], ['b', false],
    // Row 1
    ['g', true],  ['g', false], ['b', false], ['b', false], ['o', false], ['o', false], ['y', true],  ['b', false], ['p', false], ['p', false], ['g', false], ['g', false], ['o', false], ['o', false], ['b', false],
    // Row 2
    ['p', false], ['p', true],  ['g', false], ['g', false], ['b', false], ['b', false], ['o', false], ['p', false], ['y', true],  ['y', false], ['b', false], ['b', false], ['g', false], ['g', false], ['p', false],
    // Row 3
    ['y', false], ['y', false], ['p', true],  ['p', false], ['g', false], ['g', false], ['p', false], ['y', false], ['o', false], ['o', false], ['p', false], ['p', false], ['y', false], ['y', false], ['g', false],
    // Row 4
    ['o', false], ['o', true],  ['y', false], ['y', false], ['p', false], ['p', false], ['g', true],  ['o', false], ['b', false], ['b', false], ['y', false], ['y', false], ['o', false], ['b', false], ['b', false],
    // Row 5
    ['b', false], ['b', false], ['o', false], ['o', true],  ['y', false], ['y', false], ['b', false], ['g', false], ['g', false], ['p', false], ['p', false], ['o', false], ['b', false], ['g', false], ['y', true],
    // Row 6
    ['y', true],  ['y', false], ['b', false], ['b', false], ['o', false], ['p', false], ['p', false], ['y', false], ['g', false], ['g', false], ['b', true],  ['b', false], ['p', false], ['o', false], ['o', false],
]

export const GRID_05 = {
    id: '05',
    cells: GRID_05_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
