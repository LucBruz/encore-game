import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_04_CELLS: [ColorKey, boolean][] = [
    // Row 0 — RVVJ*JJJORRVVVBJ*
    ['p', false], ['g', false], ['g', false], ['y', true],  ['y', false], ['y', false], ['y', false], ['o', false], ['p', false], ['p', false], ['g', false], ['g', false], ['g', false], ['b', false], ['y', true],
    // Row 1 — RVRRRJJORRVVBBB
    ['p', false], ['g', false], ['p', false], ['p', false], ['p', false], ['y', false], ['y', false], ['o', false], ['p', false], ['p', false], ['g', false], ['g', false], ['b', false], ['b', false], ['b', false],
    // Row 2 — BR*RBBV*VVVVR*BO*BR
    ['b', false], ['p', true],  ['p', false], ['b', false], ['b', false], ['g', true],  ['g', false], ['g', false], ['g', false], ['g', false], ['p', true],  ['b', false], ['o', true],  ['b', false], ['p', false],
    // Row 3 — OOOOBBBB*VJ*JBRRR
    ['o', false], ['o', false], ['o', false], ['o', false], ['b', false], ['b', false], ['b', false], ['b', true],  ['g', false], ['y', true],  ['y', false], ['b', false], ['p', false], ['p', false], ['p', false],
    // Row 4 — JBBOORRRBBBR*ROO
    ['y', false], ['b', false], ['b', false], ['o', false], ['o', false], ['p', false], ['p', false], ['p', false], ['b', false], ['b', false], ['b', false], ['p', true],  ['p', false], ['o', false], ['o', false],
    // Row 5 — JJB*VVOO*JJOBJJJO
    ['y', false], ['y', false], ['b', true],  ['g', false], ['g', false], ['o', false], ['o', true],  ['y', false], ['y', false], ['o', false], ['b', false], ['y', false], ['y', false], ['y', false], ['o', false],
    // Row 6 — V*JJVV*OOJO*OOOJVV
    ['g', true],  ['y', false], ['y', false], ['g', false], ['g', true],  ['o', false], ['o', false], ['y', false], ['o', true],  ['o', false], ['o', false], ['o', false], ['y', false], ['g', false], ['g', false],
]

export const GRID_04 = {
    id: '04',
    cells: GRID_04_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
