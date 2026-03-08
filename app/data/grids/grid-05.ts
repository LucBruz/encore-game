import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_05_CELLS: [ColorKey, boolean][] = [
    // Row 0 — RRVVJJJ*VVRRRROO
    ['p', false], ['p', false], ['g', false], ['g', false], ['y', false], ['y', false], ['y', true],  ['g', false], ['g', false], ['p', false], ['p', false], ['p', false], ['p', false], ['o', false], ['o', false],
    // Row 1 — O*RRB*BV*JVVR*VJ*ROO
    ['o', true],  ['p', false], ['p', false], ['b', true],  ['b', false], ['g', true],  ['y', false], ['g', false], ['g', false], ['p', true],  ['g', false], ['y', true],  ['p', false], ['o', false], ['o', false],
    // Row 2 — BO*OBVVVROVVVVV*J
    ['b', false], ['o', true],  ['o', false], ['b', false], ['g', false], ['g', false], ['g', false], ['p', false], ['o', false], ['g', false], ['g', false], ['g', false], ['g', false], ['g', true],  ['y', false],
    // Row 3 — BBOOOVRROOOOB*BJ
    ['b', false], ['b', false], ['o', false], ['o', false], ['o', false], ['g', false], ['p', false], ['p', false], ['o', false], ['o', false], ['o', false], ['o', false], ['b', true],  ['b', false], ['y', false],
    // Row 4 — VBBRRRBB*BBO*BJJV*
    ['g', false], ['b', false], ['b', false], ['p', false], ['p', false], ['p', false], ['b', false], ['b', true],  ['b', false], ['b', false], ['o', true],  ['b', false], ['y', false], ['y', false], ['g', true],
    // Row 5 — VVJ*JRBBJJJBBOJB
    ['g', false], ['g', false], ['y', true],  ['y', false], ['p', false], ['b', false], ['b', false], ['y', false], ['y', false], ['y', false], ['b', false], ['b', false], ['o', false], ['y', false], ['b', false],
    // Row 6 — JJJJR*OOOR*JJBORR
    ['y', false], ['y', false], ['y', false], ['y', false], ['p', true],  ['o', false], ['o', false], ['o', false], ['p', true],  ['y', false], ['y', false], ['b', false], ['o', false], ['p', false], ['p', false],
]

export const GRID_05 = {
    id: '05',
    cells: GRID_05_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
