import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_06_CELLS: [ColorKey, boolean][] = [
    // Row 0 — O*VBBRRRVVVJ*JJRR
    ['o', true],  ['g', false], ['b', false], ['b', false], ['p', false], ['p', false], ['p', false], ['g', false], ['g', false], ['g', false], ['y', true],  ['y', false], ['y', false], ['p', false], ['p', false],
    // Row 1 — VVVVRJVR*VVRJJRJ
    ['g', false], ['g', false], ['g', false], ['g', false], ['p', false], ['y', false], ['g', false], ['p', true],  ['g', false], ['g', false], ['p', false], ['y', false], ['y', false], ['p', false], ['y', false],
    // Row 2 — BBOV*JJV*BRRRROOJ
    ['b', false], ['b', false], ['o', false], ['g', true],  ['y', false], ['y', false], ['g', true],  ['b', false], ['p', false], ['p', false], ['p', false], ['p', false], ['o', false], ['o', false], ['y', false],
    // Row 3 — BOOOOVVBBBBOR*OO
    ['b', false], ['o', false], ['o', false], ['o', false], ['o', false], ['g', false], ['g', false], ['b', false], ['b', false], ['b', false], ['b', false], ['o', false], ['p', true],  ['o', false], ['o', false],
    // Row 4 — BR*O*RBOOOB*J*OORJ*O*
    ['b', false], ['p', true],  ['o', true],  ['p', false], ['b', false], ['o', false], ['o', false], ['o', false], ['b', true],  ['y', true],  ['o', false], ['o', false], ['p', false], ['y', true],  ['o', true],
    // Row 5 — RRRRBBBJJJOB*VVV
    ['p', false], ['p', false], ['p', false], ['p', false], ['b', false], ['b', false], ['b', false], ['y', false], ['y', false], ['y', false], ['o', false], ['b', true],  ['g', false], ['g', false], ['g', false],
    // Row 6 — JJJJV*B*JJOOVVBBB
    ['y', false], ['y', false], ['y', false], ['y', false], ['g', true],  ['b', true],  ['y', false], ['y', false], ['o', false], ['o', false], ['g', false], ['g', false], ['b', false], ['b', false], ['b', false],
]

export const GRID_06 = {
    id: '06',
    cells: GRID_06_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
