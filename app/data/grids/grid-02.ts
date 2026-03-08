import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_02_CELLS: [ColorKey, boolean][] = [
    // Row 0 — VV*OOO*RRRJ*BBBBBR
    ['g', false], ['g', true],  ['o', false], ['o', false], ['o', true],  ['p', false], ['p', false], ['p', false], ['y', true],  ['b', false], ['b', false], ['b', false], ['b', false], ['b', false], ['p', false],
    // Row 1 — ROOJVV*BJJJV*OOO*R
    ['p', false], ['o', false], ['o', false], ['y', false], ['g', false], ['g', true],  ['b', false], ['y', false], ['y', false], ['y', false], ['g', true],  ['o', false], ['o', false], ['o', true],  ['p', false],
    // Row 2 — B*BBR*VVB*JRRROVOO
    ['b', true],  ['b', false], ['b', false], ['p', true],  ['g', false], ['g', false], ['b', true],  ['y', false], ['p', false], ['p', false], ['p', false], ['o', false], ['g', false], ['o', false], ['o', false],
    // Row 3 — BBRRRVVO*OR*JVVVV
    ['b', false], ['b', false], ['p', false], ['p', false], ['p', false], ['g', false], ['g', false], ['o', true],  ['o', false], ['p', true],  ['y', false], ['g', false], ['g', false], ['g', false], ['g', false],
    // Row 4 — BRRBBBOBBOJJJJB*
    ['b', false], ['p', false], ['p', false], ['b', false], ['b', false], ['b', false], ['o', false], ['b', false], ['b', false], ['o', false], ['y', false], ['y', false], ['y', false], ['y', false], ['b', true],
    // Row 5 — OJVVBOOVBOOJ*R*RJ
    ['o', false], ['y', false], ['g', false], ['g', false], ['b', false], ['o', false], ['o', false], ['g', false], ['b', false], ['o', false], ['o', false], ['y', true],  ['p', true],  ['p', false], ['y', false],
    // Row 6 — JJJ*VJJJVVVORRRJ
    ['y', false], ['y', false], ['y', true],  ['g', false], ['y', false], ['y', false], ['y', false], ['g', false], ['g', false], ['g', false], ['o', false], ['p', false], ['p', false], ['p', false], ['y', false],
]

export const GRID_02 = {
    id: '02',
    cells: GRID_02_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
