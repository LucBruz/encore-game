import { describe, expect, it } from 'vitest'
import { CELL_COUNT, COL_OF, START_COL } from '../grid'
import {
    areCellsContiguous,
    hasLegalPlacement,
    isAnchor,
    legalPlacements,
    selectableCells,
    validatePlacement,
} from '../placement'
import { createMask } from '../mask'
import type { Cells, CheckedMask, ColorKey } from '../types'
import { COLORS, at, key, keySet, makeCells, makeMask, makeRng } from './fixtures'
import { ALL_GRIDS } from '../../app/data/grids/index'

// ─── Reference independante : force brute sur les trois predicats de la regle ──

function combinations(pool: number[], k: number): number[][] {
    const out: number[][] = []
    const cur: number[] = []
    const walk = (start: number) => {
        if (cur.length === k) { out.push(cur.slice()); return }
        for (let i = start; i <= pool.length - (k - cur.length); i++) {
            cur.push(pool[i])
            walk(i + 1)
            cur.pop()
        }
    }
    walk(0)
    return out
}

/**
 * Enumere les placements legaux en appliquant chaque predicat de la regle
 * separement, sans rien partager avec l'enumerateur teste.
 */
function bruteForcePlacements(
    cells: Cells,
    mask: CheckedMask,
    color: ColorKey,
    count: number,
): number[][] {
    const pool: number[] = []
    for (let i = 0; i < CELL_COUNT; i++) {
        if (!mask[i] && cells[i][0] === color) pool.push(i)
    }
    return combinations(pool, count).filter(
        combo => areCellsContiguous(combo) && combo.some(idx => isAnchor(idx, mask)),
    )
}

// ─── Fixtures de regle ────────────────────────────────────────────────────────

// Un unique vert en colonne H (0,7), trois verts cochables en bas a gauche.
const H_ANCHOR_CELLS = makeCells([
    'ooooooogooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'gggoooooooooooo',
])

// Le joueur a deja coche trois cases en bas a gauche : (0,7) ne touche rien.
const H_ANCHOR_MASK = makeMask([
    '...............',
    '...............',
    '...............',
    '...............',
    '...............',
    '...............',
    'xxx............',
])

// Bloc vert de 3 cases sur la ligne 0, colonnes 6-7-8, avec (0,7) deja coche.
const SPLIT_BLOCK_CELLS = makeCells([
    'ppppppgggpppppp',
    'ppppppppppppppp',
    'ppppppppppppppp',
    'ppppppppppppppp',
    'ppppppppppppppp',
    'ppppppppppppppp',
    'ppppppppppppppp',
])

const SPLIT_BLOCK_MASK = makeMask([
    '.......x.......',
    '...............',
    '...............',
    '...............',
    '...............',
    '...............',
    '...............',
])

describe('isAnchor — la colonne H est une ancre permanente', () => {
    it('ancre une case de la colonne H qui ne touche aucune croix (regression B1)', () => {
        expect(isAnchor(at(0, START_COL), H_ANCHOR_MASK)).toBe(true)
        expect(isAnchor(at(3, START_COL), createMask())).toBe(true)
    })

    it('ancre une case orthogonalement adjacente a une croix', () => {
        expect(isAnchor(at(6, 3), H_ANCHOR_MASK)).toBe(true)
        expect(isAnchor(at(5, 0), H_ANCHOR_MASK)).toBe(true)
    })

    it("n'ancre pas une case seulement adjacente en diagonale", () => {
        expect(isAnchor(at(5, 3), H_ANCHOR_MASK)).toBe(false)
    })
})

describe('legalPlacements — regles de placement', () => {
    it('autorise un nouveau groupe en colonne H en milieu de partie (regression B1)', () => {
        const placements = legalPlacements(H_ANCHOR_CELLS, H_ANCHOR_MASK, 'g', 1)
        expect(keySet(placements)).toEqual(new Set([key([at(0, START_COL)])]))
        expect(hasLegalPlacement(H_ANCHOR_CELLS, H_ANCHOR_MASK, 'g', 1)).toBe(true)
    })

    it('limite le tout premier coup a la colonne H sans traitement special', () => {
        const empty = createMask()
        const placements = legalPlacements(H_ANCHOR_CELLS, empty, 'g', 1)
        expect(placements.length).toBeGreaterThan(0)
        for (const placement of placements) {
            expect(placement.some(idx => COL_OF[idx] === START_COL)).toBe(true)
        }
        // Les trois verts du coin bas-gauche ne sont ancres par rien.
        expect(keySet(placements).has(key([at(6, 0)]))).toBe(false)
    })

    it('ne fait pas pont par une case deja cochee (exemple du livret)', () => {
        // Chaque case isolee est cochable avec un « 1 »...
        const ones = legalPlacements(SPLIT_BLOCK_CELLS, SPLIT_BLOCK_MASK, 'g', 1)
        expect(keySet(ones)).toEqual(new Set([key([at(0, 6)]), key([at(0, 8)])]))

        // ...mais un « 2 » ne peut pas couvrir les deux en un seul coup.
        expect(legalPlacements(SPLIT_BLOCK_CELLS, SPLIT_BLOCK_MASK, 'g', 2)).toEqual([])
        expect(hasLegalPlacement(SPLIT_BLOCK_CELLS, SPLIT_BLOCK_MASK, 'g', 2)).toBe(false)

        const validation = validatePlacement(
            [at(0, 6), at(0, 8)], SPLIT_BLOCK_CELLS, SPLIT_BLOCK_MASK, 'g', 2,
        )
        expect(validation.valid).toBe(false)
        expect(validation.reason).toMatch(/contigu/i)
    })

    it('refuse un groupe qui ne touche du deja-coche quen diagonale', () => {
        const cells = makeCells([
            'gpppppppppppppp',
            'pgggppppppppppp',
            'ppppppppppppppp',
            'ppppppppppppppp',
            'ppppppppppppppp',
            'ppppppppppppppp',
            'ppppppppppppppp',
        ])
        const mask = makeMask([
            'x..............',
            '...............',
            '...............',
            '...............',
            '...............',
            '...............',
            '...............',
        ])
        expect(legalPlacements(cells, mask, 'g', 3)).toEqual([])
    })

    it('interdit de repartir un coup sur deux blocs de la meme couleur', () => {
        const cells = makeCells([
            'ppppppggpggpppp',
            'ppppppppppppppp',
            'ppppppppppppppp',
            'ppppppppppppppp',
            'ppppppppppppppp',
            'ppppppppppppppp',
            'ppppppppppppppp',
        ])
        const empty = createMask()
        // Seule la paire du bloc contenant la colonne H est jouable.
        expect(keySet(legalPlacements(cells, empty, 'g', 2)))
            .toEqual(new Set([key([at(0, 6), at(0, 7)])]))
        // Le second bloc vert n'est ancre par rien.
        expect(keySet(legalPlacements(cells, empty, 'g', 1)))
            .toEqual(new Set([key([at(0, 7)])]))
    })

    it('rejette un nombre de cases hors 1..5', () => {
        const empty = createMask()
        expect(() => legalPlacements(H_ANCHOR_CELLS, empty, 'g', 0)).toThrow(RangeError)
        expect(() => legalPlacements(H_ANCHOR_CELLS, empty, 'g', 6)).toThrow(RangeError)
        expect(() => legalPlacements(H_ANCHOR_CELLS, empty, 'g', 2.5)).toThrow(RangeError)
    })
})

describe('legalPlacements — propriete contre force brute', () => {
    it('produit exactement les memes placements que la force brute', () => {
        const rng = makeRng(0xc0ffee)
        let compared = 0

        for (let iter = 0; iter < 400; iter++) {
            const rows: string[] = []
            for (let r = 0; r < 7; r++) {
                let row = ''
                for (let c = 0; c < 15; c++) row += COLORS[Math.floor(rng() * COLORS.length)]
                rows.push(row)
            }
            const cells = makeCells(rows)

            const density = 0.55 + rng() * 0.35
            const mask = createMask()
            for (let i = 0; i < CELL_COUNT; i++) if (rng() < density) mask[i] = 1

            const color = COLORS[Math.floor(rng() * COLORS.length)]
            const count = 1 + Math.floor(rng() * 5)

            // Force brute uniquement quand le binomial reste minuscule.
            let available = 0
            for (let i = 0; i < CELL_COUNT; i++) if (!mask[i] && cells[i][0] === color) available++
            if (available > 14) continue

            const expected = keySet(bruteForcePlacements(cells, mask, color, count))
            const actual = legalPlacements(cells, mask, color, count)

            expect(actual.length).toBe(new Set(actual.map(key)).size) // pas de doublon
            expect(keySet(actual)).toEqual(expected)
            expect(hasLegalPlacement(cells, mask, color, count)).toBe(expected.size > 0)
            compared++
        }

        expect(compared).toBeGreaterThan(150)
    })

    it('ne produit que des placements valides sur les 8 grilles officielles', () => {
        const rng = makeRng(0x5eed)

        for (const grid of ALL_GRIDS) {
            for (let iter = 0; iter < 40; iter++) {
                const mask = createMask()
                const density = rng() * 0.7
                for (let i = 0; i < CELL_COUNT; i++) if (rng() < density) mask[i] = 1

                for (const color of COLORS) {
                    for (let count = 1; count <= 5; count++) {
                        const placements = legalPlacements(grid.cells, mask, color, count)
                        expect(placements.length).toBe(new Set(placements.map(key)).size)
                        for (const placement of placements) {
                            const v = validatePlacement(placement, grid.cells, mask, color, count)
                            expect(v.valid, `${grid.id} ${color}x${count} ${key(placement)} : ${v.reason}`).toBe(true)
                        }
                    }
                }
            }
        }
    })
})

describe('selectableCells', () => {
    it('ne garde que les placements compatibles avec les cases deja choisies', () => {
        const placements = [[10, 11, 12], [10, 11, 25], [40, 41, 42]]
        expect(selectableCells(placements, [])).toEqual(new Set([10, 11, 12, 25, 40, 41, 42]))
        expect(selectableCells(placements, [10])).toEqual(new Set([11, 12, 25]))
        expect(selectableCells(placements, [10, 12])).toEqual(new Set([11]))
        expect(selectableCells(placements, [10, 40])).toEqual(new Set())
    })
})

describe('validatePlacement', () => {
    it('accepte un placement legal', () => {
        const v = validatePlacement([at(0, 6)], SPLIT_BLOCK_CELLS, SPLIT_BLOCK_MASK, 'g', 1)
        expect(v.valid).toBe(true)
    })

    it('refuse le mauvais nombre de cases, la mauvaise couleur et le doublon', () => {
        const cells = SPLIT_BLOCK_CELLS
        const mask = SPLIT_BLOCK_MASK
        expect(validatePlacement([at(0, 6), at(0, 8)], cells, mask, 'g', 1).valid).toBe(false)
        expect(validatePlacement([at(1, 0)], cells, mask, 'g', 1).valid).toBe(false)
        expect(validatePlacement([at(0, 6), at(0, 6)], cells, mask, 'g', 2).valid).toBe(false)
        expect(validatePlacement([at(0, 7)], cells, mask, 'g', 1).valid).toBe(false)
    })
})
