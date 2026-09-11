import { describe, expect, it } from 'vitest'
import { GRID_01 } from '../../app/data/grids/grid-01'
import {
    COLOR_FACES, DICE_PER_KIND, NUMBER_FACES,
    colorRollClasses, makeRng, numberRollClasses, rollDice,
} from '../dice'
import { CELL_COUNT, GRID_COLS, GRID_ROWS } from '../grid'
import { createMask, maskFromIndices, maskFromSet, setFromMask } from '../mask'
import {
    completedColors, completedColumns, colorTotals, hasTwoCompletedColors, scoreSheet,
} from '../scoring'
import { applyMove, createSheet, legalMoves } from '../state'
import { at, makeCells } from './fixtures'

describe('mask', () => {
    it('fait l aller-retour Set <-> masque', () => {
        const set = new Set([0, 7, 104])
        expect(setFromMask(maskFromSet(set))).toEqual(set)
    })

    it('cree un masque vide de la bonne taille', () => {
        expect(createMask().length).toBe(CELL_COUNT)
        expect(createMask().every(v => v === 0)).toBe(true)
    })
})

describe('dice', () => {
    it('lance 3 des de chaque type, faces valides', () => {
        const rng = makeRng(1)
        for (let i = 0; i < 200; i++) {
            const roll = rollDice(rng)
            expect(roll.colors).toHaveLength(DICE_PER_KIND)
            expect(roll.numbers).toHaveLength(DICE_PER_KIND)
            for (const c of roll.colors) expect(COLOR_FACES).toContain(c)
            for (const n of roll.numbers) expect(NUMBER_FACES).toContain(n)
        }
    })

    it('enumere 56 classes de lancer dont les probabilites somment a 1', () => {
        for (const classes of [colorRollClasses(), numberRollClasses()]) {
            expect(classes).toHaveLength(56) // C(6+3-1, 3) = C(8,3)
            const total = classes.reduce((s, c) => s + c.probability, 0)
            expect(total).toBeCloseTo(1, 10)
        }
    })

    it('est deterministe a graine egale', () => {
        const a = Array.from({ length: 5 }, (_, i) => rollDice(makeRng(42 + i)))
        const b = Array.from({ length: 5 }, (_, i) => rollDice(makeRng(42 + i)))
        expect(a).toEqual(b)
    })
})

describe('scoring', () => {
    const cells = GRID_01.cells

    it('compte 105 cases reparties sur les 5 couleurs', () => {
        const totals = colorTotals(cells)
        expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(CELL_COUNT)
    })

    it('detecte une couleur complete', () => {
        const greens: number[] = []
        for (let i = 0; i < CELL_COUNT; i++) if (cells[i][0] === 'g') greens.push(i)
        const mask = maskFromIndices(greens)
        expect(completedColors(cells, mask)).toEqual(['g'])
        expect(hasTwoCompletedColors(cells, mask)).toBe(false)
    })

    it('detecte une colonne complete', () => {
        const col = 3
        const mask = maskFromIndices(
            Array.from({ length: GRID_ROWS }, (_, r) => r * GRID_COLS + col),
        )
        expect(completedColumns(mask)).toEqual([col])
    })

    it('applique le malus etoiles seulement en fin de partie', () => {
        const mask = createMask()
        const during = scoreSheet(cells, mask, 0, { gameOver: false })
        const ending = scoreSheet(cells, mask, 0, { gameOver: true })
        expect(during.starMalus).toBe(0)
        expect(ending.starMalus).toBeGreaterThan(0)
        expect(ending.starMalus % 2).toBe(0) // -2 par etoile
    })

    it('credite les jokers restants et les deduit quand ils sont depenses', () => {
        const mask = createMask()
        expect(scoreSheet(cells, mask, 0, { totalJokers: 8 }).jokersLeft).toBe(8)
        expect(scoreSheet(cells, mask, 3, { totalJokers: 8 }).jokersLeft).toBe(5)
        expect(scoreSheet(cells, mask, 99, { totalJokers: 8 }).jokersLeft).toBe(0)
    })

    it('ordonne les modes de bonus : others <= average <= first', () => {
        const col = 0 // colonne A : 5 / 3
        const mask = maskFromIndices(Array.from({ length: GRID_ROWS }, (_, r) => r * GRID_COLS + col))
        const others = scoreSheet(cells, mask, 0, { mode: 'others' }).columnBonus
        const average = scoreSheet(cells, mask, 0, { mode: 'average' }).columnBonus
        const first = scoreSheet(cells, mask, 0, { mode: 'first' }).columnBonus
        expect(others).toBe(3)
        expect(first).toBe(5)
        expect(average).toBe(4)
    })
})

describe('legalMoves', () => {
    const cells = makeCells([
        'ooooooogooooooo',
        'ooooooogooooooo',
        'ooooooooooooooo',
        'ooooooooooooooo',
        'ooooooooooooooo',
        'ooooooooooooooo',
        'ooooooooooooooo',
    ])

    it('ne propose que des coups dont le placement est legal', () => {
        const sheet = createSheet()
        const moves = legalMoves(cells, sheet, { colors: ['g', 'o', 'y'], numbers: [1, 2, 3] })
        expect(moves.length).toBeGreaterThan(0)
        for (const m of moves) {
            expect(m.placement).toHaveLength(m.count)
            for (const idx of m.placement) expect(cells[idx][0]).toBe(m.color)
        }
    })

    it('resout le joker couleur en toutes les couleurs jouables', () => {
        const sheet = createSheet()
        const moves = legalMoves(cells, sheet, { colors: ['joker', 'joker', 'joker'], numbers: [1, 1, 1] })
        const colors = new Set(moves.map(m => m.color))
        // Seules les cases de la colonne H sont ancrees au premier coup : vert et orange.
        expect(colors.has('g')).toBe(true)
        expect(colors.has('o')).toBe(true)
        for (const m of moves) expect(m.jokersSpent).toBe(1)
    })

    it('interdit une combinaison joker quand il ne reste plus de joker', () => {
        const sheet = createSheet()
        sheet.jokersUsed = 8
        const moves = legalMoves(cells, sheet, { colors: ['joker', 'joker', 'joker'], numbers: ['joker', 'joker', 'joker'] }, { totalJokers: 8 })
        expect(moves).toEqual([])
    })

    it('retient la paire de des la moins couteuse en jokers pour une meme combo', () => {
        const sheet = createSheet()
        // Vert x1 est atteignable sans joker (de vert + de 1) ou avec (joker + 1).
        const moves = legalMoves(cells, sheet, { colors: ['g', 'joker', 'y'], numbers: [1, 1, 1] })
        const green1 = moves.filter(m => m.color === 'g' && m.count === 1)
        expect(green1.length).toBeGreaterThan(0)
        for (const m of green1) expect(m.jokersSpent).toBe(0)
    })

    it('applique un coup en cochant les cases et en debitant les jokers', () => {
        const sheet = createSheet()
        const moves = legalMoves(cells, sheet, { colors: ['joker', 'g', 'y'], numbers: [1, 2, 3] })
        const jokerMove = moves.find(m => m.jokersSpent === 1)!
        applyMove(sheet, jokerMove)
        expect(sheet.jokersUsed).toBe(1)
        for (const idx of jokerMove.placement) expect(sheet.mask[idx]).toBe(1)
    })

    it('ne propose rien quand aucune case n est ancree', () => {
        // Grille sans aucune case verte en colonne H et rien de coche.
        const noGreenInH = makeCells([
            'gggggggoggggggg',
            'gggggggoggggggg',
            'gggggggoggggggg',
            'gggggggoggggggg',
            'gggggggoggggggg',
            'gggggggoggggggg',
            'gggggggoggggggg',
        ])
        const sheet = createSheet()
        expect(legalMoves(noGreenInH, sheet, { colors: ['g', 'g', 'g'], numbers: [1, 2, 3] })).toEqual([])
    })
})

describe('coherence avec la grille reelle', () => {
    it('le premier coup sur grid-01 touche toujours la colonne H', () => {
        const sheet = createSheet()
        const moves = legalMoves(GRID_01.cells, sheet, {
            colors: ['g', 'y', 'b'], numbers: [1, 2, 3],
        })
        expect(moves.length).toBeGreaterThan(0)
        for (const m of moves) {
            expect(m.placement.some(idx => idx % GRID_COLS === 7)).toBe(true)
        }
    })

    it('la case de depart H0 de grid-01 est verte et etoilee', () => {
        expect(GRID_01.cells[at(0, 7)]).toEqual(['g', true])
    })
})
