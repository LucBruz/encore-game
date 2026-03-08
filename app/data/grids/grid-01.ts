export const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'] as const

export const COLUMN_POINTS: Record<string, { first: number; others: number }> = {
    A: { first: 5, others: 3 }, B: { first: 3, others: 2 }, C: { first: 3, others: 2 }, D: { first: 3, others: 2 },
    E: { first: 2, others: 1 }, F: { first: 2, others: 1 }, G: { first: 2, others: 1 }, H: { first: 1, others: 0 },
    I: { first: 2, others: 1 }, J: { first: 2, others: 1 }, K: { first: 2, others: 1 }, L: { first: 3, others: 2 },
    M: { first: 3, others: 2 }, N: { first: 3, others: 2 }, O: { first: 5, others: 3 }
}

export type ColorKey = 'g' | 'y' | 'b' | 'p' | 'o'

export const COLOR_MAP: Record<ColorKey, { name: string; hex: string; label: string }> = {
    g: { name: 'green', hex: '#5cc96e', label: 'Vert' },
    y: { name: 'yellow', hex: '#f5d742', label: 'Jaune' },
    b: { name: 'blue', hex: '#5b9ff5', label: 'Bleu' },
    p: { name: 'pink', hex: '#e85a82', label: 'Rose' },
    o: { name: 'orange', hex: '#f58a35', label: 'Orange' },
}

export interface CellData {
    color: ColorKey
    star: boolean
}

// 7 lignes × 15 colonnes = 105 cases
// Format : [couleur, étoile]
export const GRID_01_CELLS: [ColorKey, boolean][] = [
    // Row 0 — VVVJJJJV*BBBO*JJJ
    ['g', false], ['g', false], ['g', false], ['y', false], ['y', false], ['y', false], ['y', false], ['g', true],  ['b', false], ['b', false], ['b', false], ['o', true],  ['y', false], ['y', false], ['y', false],
    // Row 1 — OVJ*VJ*JOORB*BOOVV
    ['o', false], ['g', false], ['y', true],  ['g', false], ['y', true],  ['y', false], ['o', false], ['o', false], ['p', false], ['b', true],  ['b', false], ['o', false], ['o', false], ['g', false], ['g', false],
    // Row 2 — B*VRVVVV*RRRJJOVV
    ['b', true],  ['g', false], ['p', false], ['g', false], ['g', false], ['g', false], ['g', true],  ['p', false], ['p', false], ['p', false], ['y', false], ['y', false], ['o', false], ['g', false], ['g', false],
    // Row 3 — BRRVOO*BBVVJJOR*B
    ['b', false], ['p', false], ['p', false], ['g', false], ['o', false], ['o', true],  ['b', false], ['b', false], ['g', false], ['g', false], ['y', false], ['y', false], ['o', false], ['p', true],  ['b', false],
    // Row 4 — ROOOORBBOOORRRR
    ['p', false], ['o', false], ['o', false], ['o', false], ['o', false], ['p', false], ['b', false], ['b', false], ['o', false], ['o', false], ['o', false], ['p', false], ['p', false], ['p', false], ['p', false],
    // Row 5 — RB*BR*RRRJJ*OR*BBBO*
    ['p', false], ['b', true],  ['b', false], ['p', true],  ['p', false], ['p', false], ['p', false], ['y', false], ['y', true],  ['o', false], ['p', true],  ['b', false], ['b', false], ['b', false], ['o', true],
    // Row 6 — JJBBBBRJJJVVV*OO
    ['y', false], ['y', false], ['b', false], ['b', false], ['b', false], ['b', false], ['p', false], ['y', false], ['y', false], ['y', false], ['g', false], ['g', false], ['g', true],  ['o', false], ['o', false],
]

export const GRID_01 = {
    id: '01',
    cells: GRID_01_CELLS,
    cols: COLS,
    columnPoints: COLUMN_POINTS,
    colorMap: COLOR_MAP,
    jokers: 8,
}