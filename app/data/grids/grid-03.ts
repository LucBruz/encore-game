import type { ColorKey } from './grid-01'
import { COLS, COLUMN_POINTS, COLOR_MAP } from './grid-01'

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_03_CELLS: [ColorKey, boolean][] = [
    // Row 0 — JJO*OOV*BBBJJRRVV
    ['y', false], ['y', false], ['o', true],  ['o', false], ['o', false], ['g', true],  ['b', false], ['b', false], ['b', false], ['y', false], ['y', false], ['p', false], ['p', false], ['g', false], ['g', false],
    // Row 1 — OBBBRRRR*RJJ*BRR*O
    ['o', false], ['b', false], ['b', false], ['b', false], ['p', false], ['p', false], ['p', false], ['p', true],  ['p', false], ['y', false], ['y', true],  ['b', false], ['p', false], ['p', true],  ['o', false],
    // Row 2 — OOBBJ*RO*OOB*BBRBB*
    ['o', false], ['o', false], ['b', false], ['b', false], ['y', true],  ['p', false], ['o', true],  ['o', false], ['o', false], ['b', true],  ['b', false], ['b', false], ['p', false], ['b', false], ['b', true],
    // Row 3 — OV*JJJJOVOBBO*BBR
    ['o', false], ['g', true],  ['y', false], ['y', false], ['y', false], ['y', false], ['o', false], ['g', false], ['o', false], ['b', false], ['b', false], ['o', true],  ['b', false], ['b', false], ['p', false],
    // Row 4 — VVVR*JOVVJ*OOOOOR
    ['g', false], ['g', false], ['g', false], ['p', true],  ['y', false], ['o', false], ['g', false], ['g', false], ['y', true],  ['o', false], ['o', false], ['o', false], ['o', false], ['o', false], ['p', false],
    // Row 5 — B*VRVVOVJVRRJJJR
    ['b', true],  ['g', false], ['p', false], ['g', false], ['g', false], ['o', false], ['g', false], ['y', false], ['g', false], ['p', false], ['p', false], ['y', false], ['y', false], ['y', false], ['p', false],
    // Row 6 — RRRVBBJJVVVVV*JJ
    ['p', false], ['p', false], ['p', false], ['g', false], ['b', false], ['b', false], ['y', false], ['y', false], ['g', false], ['g', false], ['g', false], ['g', false], ['g', true],  ['y', false], ['y', false],
]

export const GRID_03 = {
    id: '03',
    cells: GRID_03_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}
