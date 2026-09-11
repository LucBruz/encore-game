import { CELL_COUNT, GRID_COLS, GRID_ROWS, cellIndex } from '../grid'
import type { Cells, CheckedMask, ColorKey } from '../types'

/**
 * Construit une grille de test depuis 7 lignes de 15 caracteres.
 * Minuscule = case simple, MAJUSCULE = case avec etoile.
 * Lettres : g (vert) y (jaune) b (bleu) p (rose) o (orange).
 */
export function makeCells(rows: string[]): Cells {
    if (rows.length !== GRID_ROWS) {
        throw new Error(`Il faut ${GRID_ROWS} lignes, recu ${rows.length}`)
    }
    const cells: [ColorKey, boolean][] = []
    rows.forEach((row, r) => {
        if (row.length !== GRID_COLS) {
            throw new Error(`Ligne ${r} : ${GRID_COLS} caracteres attendus, recu ${row.length}`)
        }
        for (const ch of row) {
            const star = ch === ch.toUpperCase()
            const key = ch.toLowerCase() as ColorKey
            if (!'gybpo'.includes(key)) throw new Error(`Couleur inconnue : ${ch}`)
            cells.push([key, star])
        }
    })
    return cells
}

/**
 * Construit un masque depuis 7 lignes de 15 caracteres.
 * 'x' ou 'X' = case cochee, tout le reste = non cochee.
 */
export function makeMask(rows: string[]): CheckedMask {
    if (rows.length !== GRID_ROWS) {
        throw new Error(`Il faut ${GRID_ROWS} lignes, recu ${rows.length}`)
    }
    const mask = new Uint8Array(CELL_COUNT)
    rows.forEach((row, r) => {
        if (row.length !== GRID_COLS) {
            throw new Error(`Ligne ${r} : ${GRID_COLS} caracteres attendus, recu ${row.length}`)
        }
        for (let c = 0; c < GRID_COLS; c++) {
            if (row[c] === 'x' || row[c] === 'X') mask[cellIndex(r, c)] = 1
        }
    })
    return mask
}

export function at(row: number, col: number): number {
    return cellIndex(row, col)
}

/** Cle canonique d'un placement, pour comparer des ensembles de placements. */
export function key(placement: readonly number[]): string {
    return [...placement].sort((a, b) => a - b).join(',')
}

export function keySet(placements: readonly (readonly number[])[]): Set<string> {
    return new Set(placements.map(key))
}

/** PRNG deterministe (mulberry32), pour des tests de propriete reproductibles. */
export function makeRng(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const COLORS: ColorKey[] = ['g', 'y', 'b', 'p', 'o']
