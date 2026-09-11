export const GRID_COLS = 15
export const GRID_ROWS = 7
export const CELL_COUNT = GRID_COLS * GRID_ROWS

/** Colonne de départ H — ancre permanente (règle officielle, voir placement.ts). */
export const START_COL = 7

export const COL_OF = new Uint8Array(CELL_COUNT)
export const ROW_OF = new Uint8Array(CELL_COUNT)

export function cellIndex(row: number, col: number): number {
    return row * GRID_COLS + col
}

export function cellCoords(idx: number): { row: number; col: number } {
    return { row: ROW_OF[idx], col: COL_OF[idx] }
}

/** Voisins orthogonaux précalculés. La diagonale ne compte jamais. */
export const NEIGHBORS: readonly (readonly number[])[] = (() => {
    const all: number[][] = []
    for (let idx = 0; idx < CELL_COUNT; idx++) {
        const row = Math.floor(idx / GRID_COLS)
        const col = idx % GRID_COLS
        ROW_OF[idx] = row
        COL_OF[idx] = col
        const n: number[] = []
        if (row > 0) n.push(idx - GRID_COLS)
        if (row < GRID_ROWS - 1) n.push(idx + GRID_COLS)
        if (col > 0) n.push(idx - 1)
        if (col < GRID_COLS - 1) n.push(idx + 1)
        all.push(n)
    }
    return all
})()

export function neighbors(idx: number): readonly number[] {
    return NEIGHBORS[idx]
}

/** Indices des 7 cases d'une colonne, de haut en bas. */
export function columnCells(col: number): number[] {
    const out: number[] = []
    for (let row = 0; row < GRID_ROWS; row++) out.push(cellIndex(row, col))
    return out
}
