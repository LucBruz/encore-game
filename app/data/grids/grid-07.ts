import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_07_CELLS: [ColorKey, boolean][] = [
    // Row 0 — O*OJ*ORRR*VOR*VVVVV
    ['o', true],  ['o', false], ['y', true],  ['o', false], ['p', false], ['p', false], ['p', true],  ['g', false], ['o', false], ['p', true],  ['g', false], ['g', false], ['g', false], ['g', false], ['g', false],
    // Row 1 — BOOOV*RVVJ*RRV*BJJ
    ['b', false], ['o', false], ['o', false], ['o', false], ['g', true],  ['p', false], ['g', false], ['g', false], ['y', true],  ['p', false], ['p', false], ['g', true],  ['b', false], ['y', false], ['y', false],
    // Row 2 — JBBVVRVJJJRRBJO*
    ['y', false], ['b', false], ['b', false], ['g', false], ['g', false], ['p', false], ['g', false], ['y', false], ['y', false], ['y', false], ['p', false], ['p', false], ['b', false], ['y', false], ['o', true],
    // Row 3 — JJ*BJJJJB*BJJROOO
    ['y', false], ['y', true],  ['b', false], ['y', false], ['y', false], ['y', false], ['y', false], ['b', true],  ['b', false], ['y', false], ['y', false], ['p', false], ['o', false], ['o', false], ['o', false],
    // Row 4 — RJVB*BV*JOBBBBOBBR
    ['p', false], ['y', false], ['g', false], ['b', true],  ['b', false], ['g', true],  ['y', false], ['o', false], ['b', false], ['b', false], ['b', false], ['b', false], ['o', false], ['b', false], ['b', false],
    // Row 5 — VVVRBBBOVVO*JJB*B
    ['g', false], ['g', false], ['g', false], ['p', false], ['b', false], ['b', false], ['b', false], ['o', false], ['g', false], ['g', false], ['o', true],  ['y', false], ['y', false], ['b', true],  ['b', false],
    // Row 6 — VRRROOORROOOR*RR
    ['g', false], ['p', false], ['p', false], ['p', false], ['o', false], ['o', false], ['o', false], ['p', false], ['p', false], ['o', false], ['o', false], ['o', false], ['p', true],  ['p', false], ['p', false],
]

export const GRID_07 = {
    id: '07',
    cells: GRID_07_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
