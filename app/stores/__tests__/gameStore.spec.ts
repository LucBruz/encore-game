import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../gameStore'
import type { DiceColor, DiceNumber, DicesRoll } from '../gameStore'
import { GRID_01 } from '~/data/grids/grid-01'
import { at, makeCells } from '~~/engine/__tests__/fixtures'
import { START_COL } from '~~/engine/grid'

// Un seul vert en colonne H (0,7) ; trois verts en bas a gauche, tous cochables.
const CELLS = makeCells([
    'ooooooogooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'gggoooooooooooo',
])

const color = (value: DiceColor['value']): DiceColor => ({ type: 'color', value })
const num = (value: DiceNumber['value']): DiceNumber => ({ type: 'number', value })

function roll(colors: DiceColor['value'][], numbers: DiceNumber['value'][]): DicesRoll {
    return {
        colorDices: colors.map(color) as DicesRoll['colorDices'],
        numberDices: numbers.map(num) as DicesRoll['numberDices'],
    }
}

/** Partie a mi-parcours : p1 actif, tour 5, grille de test, p1 a deja coche en bas a gauche. */
function setupMidGame() {
    const store = useGameStore()
    store.initPlayers([{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }])
    store.grid = { ...GRID_01, cells: CELLS as any, jokers: 8 }
    store.turnNumber = 5
    store.currentPlayerIndex = 0
    store.activePlayerId = 'p1'
    store.phase = 'waiting_roll'

    const p1 = store.players.find(p => p.id === 'p1')!
    p1.checkedCells = new Set([at(6, 0), at(6, 1), at(6, 2)])
    return { store, p1 }
}

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('colonne H comme ancre permanente (B1)', () => {
    it('rend cliquable une case de la colonne H qui ne touche aucune croix', () => {
        const { store, p1 } = setupMidGame()
        store.rollDicesWithResult(roll(['g', 'y', 'b'], [1, 2, 3]))
        expect(store.phase).toBe('active_selecting')

        store.confirmActiveCombo(0, 0) // vert x1
        expect(p1.confirmedCombo).toEqual({ color: 'g', count: 1 })

        const clickable = store.validCellsForPlayer('p1')
        expect(clickable.has(at(0, START_COL))).toBe(true)
    })

    it('laisse effectivement cocher cette case', () => {
        const { store, p1 } = setupMidGame()
        store.rollDicesWithResult(roll(['g', 'y', 'b'], [1, 2, 3]))
        store.confirmActiveCombo(0, 0)

        store.togglePendingCell('p1', at(0, START_COL))
        expect(store.placementError).toBeNull()
        expect(p1.pendingCells).toEqual([at(0, START_COL)])

        store.confirmPendingCells('p1')
        expect(p1.checkedCells.has(at(0, START_COL))).toBe(true)
        expect(store.placementError).toBeNull()
    })
})

describe('jokers debites au placement, pas a la confirmation (B3)', () => {
    it('ne consomme pas de joker si le joueur confirme puis passe', () => {
        const { store, p1 } = setupMidGame()
        store.rollDicesWithResult(roll(['joker', 'y', 'b'], [1, 2, 3]))

        store.confirmActiveCombo(0, 0, 'g') // joker couleur resolu en vert, x1
        expect(p1.pendingJokers).toBe(1)
        expect(p1.jokersUsed).toBe(0)

        store.passPassiveTurn('p1')
        expect(p1.jokersUsed).toBe(0)
        expect(p1.pendingJokers).toBe(0)
    })

    it('consomme le joker une fois le placement valide', () => {
        const { store, p1 } = setupMidGame()
        store.rollDicesWithResult(roll(['joker', 'y', 'b'], [1, 2, 3]))

        store.confirmActiveCombo(0, 0, 'g')
        store.togglePendingCell('p1', at(0, START_COL))
        store.confirmPendingCells('p1')

        expect(p1.jokersUsed).toBe(1)
        expect(p1.pendingJokers).toBe(0)
    })

    it('compte deux jokers pour une combo joker couleur + joker chiffre', () => {
        const { store, p1 } = setupMidGame()
        store.rollDicesWithResult(roll(['joker', 'y', 'b'], ['joker', 2, 3]))

        store.confirmActiveCombo(0, 0, 'g', 1)
        expect(p1.pendingJokers).toBe(2)
        expect(p1.jokersUsed).toBe(0)

        store.togglePendingCell('p1', at(0, START_COL))
        store.confirmPendingCells('p1')
        expect(p1.jokersUsed).toBe(2)
    })
})

describe('combo sans placement possible (B2)', () => {
    it('signale la combo comme injouable avant confirmation', () => {
        const { store } = setupMidGame()
        store.rollDicesWithResult(roll(['g', 'y', 'b'], [1, 2, 3]))
        // Un seul vert atteignable : vert x1 passe, vert x2 non.
        expect(store.canPlayCombo('p1', 'g', 1)).toBe(true)
        expect(store.canPlayCombo('p1', 'g', 2)).toBe(false)
    })

    it('fait passer le joueur au lieu de le bloquer sans case cliquable', () => {
        const { store, p1 } = setupMidGame()
        store.rollDicesWithResult(roll(['g', 'y', 'b'], [2, 3, 4]))

        store.confirmActiveCombo(0, 0) // vert x2 : aucun placement
        expect(p1.validCombos).toEqual([])
        expect(p1.hasPassed).toBe(true)
        expect(p1.hasPlaced).toBe(true)
        expect(p1.jokersUsed).toBe(0)
        expect(p1.pendingJokers).toBe(0)
        expect(store.validCellsForPlayer('p1').size).toBe(0)
    })

    it('rend les 6 des aux joueurs passifs quand l actif passe faute de placement', () => {
        const { store } = setupMidGame()
        store.rollDicesWithResult(roll(['g', 'y', 'b'], [2, 3, 4]))
        store.confirmActiveCombo(0, 0) // vert x2 : aucun placement -> auto-pass

        // Regle : "Si le joueur actif ne souhaite rien cocher sur sa feuille, ses
        // adversaires peuvent alors choisir une combinaison parmi les 6 des non utilises."
        expect(store.activeSelection).toBeNull()
        expect(store.availableForPassive.colorDices).toHaveLength(3)
        expect(store.availableForPassive.numberDices).toHaveLength(3)
    })

    it('detecte qu aucune combinaison du lancer n est jouable', () => {
        const { store } = setupMidGame()
        // Aucune case orange n'est ancree, et il ne reste qu'un seul vert.
        store.rollDicesWithResult(roll(['g', 'g', 'g'], [4, 5, 4]))
        expect(store.hasAnyPlayableCombo('p1')).toBe(false)

        store.phase = 'waiting_roll'
        store.currentRoll = null
        store.rollDicesWithResult(roll(['g', 'g', 'g'], [1, 5, 4]))
        expect(store.hasAnyPlayableCombo('p1')).toBe(true)
    })
})

describe('rejeu des evenements (multijoueur)', () => {
    it('reconstruit le meme jokersUsed depuis la meme suite d evenements', () => {
        const play = () => {
            setActivePinia(createPinia())
            const { store, p1 } = setupMidGame()
            store.rollDicesWithResult(roll(['joker', 'y', 'b'], [1, 2, 3]))
            store.confirmActiveCombo(0, 0, 'g')
            store.togglePendingCell('p1', at(0, START_COL))
            store.confirmPendingCells('p1')
            return { jokersUsed: p1.jokersUsed, checked: [...p1.checkedCells].sort((a, b) => a - b) }
        }
        expect(play()).toEqual(play())
    })
})

describe('nextTurn n abandonne jamais un groupe incomplet', () => {
    it('ne coche pas une selection partielle restee en attente', () => {
        const { store, p1 } = setupMidGame()
        // Trois verts contigus en bas a gauche : on en coche deja un pour ancrer.
        p1.checkedCells = new Set([at(5, 0)])
        store.rollDicesWithResult(roll(['g', 'y', 'b'], [3, 2, 1]))
        store.confirmActiveCombo(0, 0) // vert x3
        store.togglePendingCell('p1', at(6, 0))
        expect(p1.pendingCells.length).toBe(1)

        const before = new Set(p1.checkedCells)
        store.phase = 'turn_end'
        store.nextTurn()

        expect(p1.pendingCells).toEqual([])
        expect([...p1.checkedCells].sort()).toEqual([...before].sort())
    })
})
