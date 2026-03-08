import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_08_CELLS: [ColorKey, boolean][] = [
    // Row 0 — RRO*JJR*RVVJJ*O*OOB
    ['p', false], ['p', false], ['o', true],  ['y', false], ['y', false], ['p', true],  ['p', false], ['g', false], ['g', false], ['y', false], ['y', true],  ['o', true],  ['o', false], ['o', false], ['b', false],
    // Row 1 — BJJJOORRBB*JJROO
    ['b', false], ['y', false], ['y', false], ['y', false], ['o', false], ['o', false], ['p', false], ['p', false], ['b', false], ['b', true],  ['y', false], ['y', false], ['p', false], ['o', false], ['o', false],
    // Row 2 — BJBBBOOO*BVVJRRO
    ['b', false], ['y', false], ['b', false], ['b', false], ['b', false], ['o', false], ['o', false], ['o', true],  ['b', false], ['g', false], ['g', false], ['y', false], ['p', false], ['p', false], ['o', false],
    // Row 3 — OB*BV*BJJBOOVVV*RR
    ['o', false], ['b', true],  ['b', false], ['g', true],  ['b', false], ['y', false], ['y', false], ['b', false], ['o', false], ['o', false], ['g', false], ['g', false], ['g', true],  ['p', false], ['p', false],
    // Row 4 — OORRVBBBJOORJJJ*
    ['o', false], ['o', false], ['p', false], ['p', false], ['g', false], ['b', false], ['b', false], ['b', false], ['y', false], ['o', false], ['o', false], ['p', false], ['y', false], ['y', false], ['y', true],
    // Row 5 — VVROVVV*JJRRRBB*V
    ['g', false], ['g', false], ['p', false], ['o', false], ['g', false], ['g', false], ['g', true],  ['y', false], ['y', false], ['p', false], ['p', false], ['p', false], ['b', false], ['b', true],  ['g', false],
    // Row 6 — J*VVOR*VVOR*RBBBBVV
    ['y', true],  ['g', false], ['g', false], ['o', false], ['p', true],  ['g', false], ['g', false], ['o', false], ['p', true],  ['p', false], ['b', false], ['b', false], ['b', false], ['g', false], ['g', false],
]

export const GRID_08 = {
    id: '08',
    cells: GRID_08_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
