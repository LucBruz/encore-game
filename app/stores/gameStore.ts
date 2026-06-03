import { defineStore } from 'pinia'
import { GRID_01, COLUMN_POINTS } from '~/data/grids/grid-01'
import type { ColorKey } from '~/data/grids/grid-01'
import { GRID_MAP } from '~/data/grids/index'
import type { GridId } from '~/data/grids/index'
import {
    findAllValidCombos,
    getSelectableCells,
    validatePlacement,
    findPlacementCandidates,
} from '~/utils/gameRules'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type ColorFace = ColorKey | 'joker'
export type NumberFace = 1 | 2 | 3 | 4 | 5 | 'joker'

export type TurnPhase =
    | 'waiting_roll'
    | 'active_selecting'
    | 'passive_selecting'
    | 'turn_end'

export interface DiceColor {
    type: 'color'
    value: ColorFace
}

export interface DiceNumber {
    type: 'number'
    value: NumberFace
}

export type Dice = DiceColor | DiceNumber

export interface DicesRoll {
    colorDices: [DiceColor, DiceColor, DiceColor]
    numberDices: [DiceNumber, DiceNumber, DiceNumber]
}

export interface SelectedCombo {
    colorDiceIndex: number
    numberDiceIndex: number
}

export interface PlayerState {
    id: string
    name: string
    checkedCells: Set<number>
    pendingCells: number[]
    // Toutes les combos valides complètes calculées à la confirmation des dés
    validCombos: number[][]
    jokersUsed: number
    colorBonus: Record<ColorKey, 'first' | 'others' | null>
    columnBonus: Record<string, 'first' | 'others' | null>
    hasPassed: boolean
    hasConfirmed: boolean
    hasPlaced: boolean
    confirmedCombo: { color: ColorKey; count: number } | null
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function createPlayer(id: string, name: string): PlayerState {
    return {
        id,
        name,
        checkedCells: new Set(),
        pendingCells: [],
        validCombos: [],
        jokersUsed: 0,
        colorBonus: { g: null, y: null, b: null, p: null, o: null },
        columnBonus: Object.fromEntries(
            ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'].map(c => [c, null])
        ),
        hasPassed: false,
        hasConfirmed: false,
        hasPlaced: false,
        confirmedCombo: null,
    }
}

function rollColorDice(): DiceColor {
    const faces: ColorFace[] = ['g', 'y', 'b', 'p', 'o', 'joker']
    return { type: 'color', value: faces[Math.floor(Math.random() * 6)] }
}

function rollNumberDice(): DiceNumber {
    const faces: NumberFace[] = [1, 2, 3, 4, 5, 'joker']
    return { type: 'number', value: faces[Math.floor(Math.random() * 6)] }
}

export function rollAllDices(): DicesRoll {
    return {
        colorDices: [rollColorDice(), rollColorDice(), rollColorDice()],
        numberDices: [rollNumberDice(), rollNumberDice(), rollNumberDice()],
    }
}

function resolveColor(face: ColorFace, jokerColor?: ColorKey): ColorKey | null {
    if (face === 'joker') return jokerColor ?? null
    return face
}

function resolveCount(face: NumberFace, jokerCount?: number): number | null {
    if (face === 'joker') return jokerCount ?? null
    return face
}

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useGameStore = defineStore('game', {
    state: () => ({
        grid: { ...GRID_01, cells: [...GRID_01.cells] },
        players: [createPlayer('p1', 'Joueur 1'), createPlayer('p2', 'Joueur 2')] as PlayerState[],
        currentPlayerIndex: 0,
        turnNumber: 0,
        gameOver: false,
        completionQueue: [] as { playerId: string; color: ColorKey }[],
        columnCompletionQueue: [] as { playerId: string; column: string; points: number }[],
        activePlayerId: 'p1',
        gameId: null as string | null,

        phase: 'waiting_roll' as TurnPhase,

        currentRoll: null as DicesRoll | null,
        activeSelection: null as SelectedCombo | null,
        passiveSelections: {} as Record<string, SelectedCombo | null>,

        placementError: null as string | null,
    }),

    getters: {
        currentPlayer: (state): PlayerState => state.players[state.currentPlayerIndex],

        isFirstThreeTurns: (state) => state.turnNumber < 3,

        lastColorCompleted: (state): { playerId: string; color: ColorKey } | null =>
            state.completionQueue[0] ?? null,

        lastColumnCompleted: (state): { playerId: string; column: string; points: number } | null =>
            state.columnCompletionQueue[0] ?? null,

        passivePlayers: (state): PlayerState[] =>
            state.players.filter(p => p.id !== state.activePlayerId),

        allPassiveDone: (state): boolean => {
            // Tours 1–3 : tous les joueurs jouent en parallèle → tous doivent avoir joué
            if (state.turnNumber < 3) {
                return state.players.every(p => p.hasPlaced || p.hasPassed)
            }
            const passives = state.players.filter(p => p.id !== state.activePlayerId)
            return passives.every(p => p.hasPlaced || p.hasPassed)
        },

        availableForPassive(state): { colorDices: DiceColor[]; numberDices: DiceNumber[] } {
            if (!state.currentRoll) return { colorDices: [], numberDices: [] }

            if (state.turnNumber < 3) {
                return {
                    colorDices: [...state.currentRoll.colorDices],
                    numberDices: [...state.currentRoll.numberDices],
                }
            }

            if (!state.activeSelection) {
                return {
                    colorDices: [...state.currentRoll.colorDices],
                    numberDices: [...state.currentRoll.numberDices],
                }
            }

            const colorDices = state.currentRoll.colorDices.filter(
                (_, i) => i !== state.activeSelection!.colorDiceIndex
            )
            const numberDices = state.currentRoll.numberDices.filter(
                (_, i) => i !== state.activeSelection!.numberDiceIndex
            )
            return { colorDices, numberDices }
        },

        /**
         * Cases cliquables pour un joueur à l'instant T.
         * Utilise getSelectableCells pour filtrer parmi les combos pré-calculées,
         * en tenant compte des cases déjà sélectionnées (pendingCells).
         */
        validCellsForPlayer: (state) => (playerId: string): Set<number> => {
            const player = state.players.find(p => p.id === playerId)
            if (!player || !player.confirmedCombo || player.validCombos.length === 0) return new Set()

            // Si toutes les cases sont déjà sélectionnées, rien à ajouter
            const { count } = player.confirmedCombo
            if (player.pendingCells.length >= count) return new Set()

            return getSelectableCells(player.validCombos, player.pendingCells)
        },

        canPlaceForPlayer: (state) => (playerId: string): boolean => {
            const player = state.players.find(p => p.id === playerId)
            if (!player || !player.confirmedCombo) return false

            const { color, count } = player.confirmedCombo
            const isFirstMove = player.checkedCells.size === 0

            const candidates = findPlacementCandidates({
                cells: state.grid.cells,
                checkedCells: player.checkedCells,
                color,
                count,
                isFirstMove,
            })
            return candidates.length > 0
        },

        jokersAvailable: (state) => (playerId: string): number => {
            const player = state.players.find(p => p.id === playerId)
            if (!player) return 0
            return state.grid.jokers - player.jokersUsed
        },

        scoreForPlayer: (state) => (playerId: string) => {
            const player = state.players.find(p => p.id === playerId)
            if (!player) return 0

            let bonusTotal = 0
            Object.values(player.colorBonus).forEach(v => {
                if (v === 'first') bonusTotal += 5
                else if (v === 'others') bonusTotal += 3
            })

            let colTotal = 0
            Object.entries(player.columnBonus).forEach(([col, v]) => {
                if (v === 'first') colTotal += COLUMN_POINTS[col].first
                else if (v === 'others') colTotal += COLUMN_POINTS[col].others
            })

            const jokersLeft = state.grid.jokers - player.jokersUsed

            let starMalus = 0
            if (state.gameOver) {
                state.grid.cells.forEach(([_, star], idx) => {
                    if (star && !player.checkedCells.has(idx)) starMalus += 2
                })
            }

            return bonusTotal + colTotal + jokersLeft - starMalus
        },
    },

    actions: {
        /**
         * Initialise les joueurs depuis le lobby (remplace les joueurs hardcodés).
         * Réinitialise tout le state pour une nouvelle partie.
         */
        initPlayers(players: { id: string; name: string }[]) {
            this.players = players.map(p => createPlayer(p.id, p.name))
            this.currentPlayerIndex = 0
            this.activePlayerId = players[0].id
            this.turnNumber = 0
            this.gameOver = false
            this.gameId = null
            this.phase = 'waiting_roll'
            this.currentRoll = null
            this.activeSelection = null
            this.passiveSelections = {}
            this.placementError = null
            this.completionQueue = []
            this.columnCompletionQueue = []
        },

        initGrid(gridId: string) {
            const grid = GRID_MAP[gridId as GridId]
            if (grid) this.grid = { ...grid, cells: [...grid.cells] }
        },

        addPlayer(name: string) {
            const id = `p${this.players.length + 1}`
            this.players.push(createPlayer(id, name))
        },

        rollDices() {
            if (this.phase !== 'waiting_roll') return
            const roll = rollAllDices()
            this.rollDicesWithResult(roll)
        },

        /**
         * Applique un roll déjà généré — utilisé par les clients distants
         * pour recevoir exactement le même tirage que le joueur actif.
         */
        rollDicesWithResult(roll: DicesRoll) {
            if (this.phase !== 'waiting_roll') return
            if (this.gameOver) return
            this.currentRoll = roll
            // Tours 1–3 : tout le monde choisit en même temps → pas de phase active_selecting
            this.phase = this.turnNumber < 3 ? 'passive_selecting' : 'active_selecting'
            this.players.forEach(p => {
                p.hasPassed = false
                p.hasConfirmed = false
                p.hasPlaced = false
                p.pendingCells = []
                p.validCombos = []
                p.confirmedCombo = null
            })
            this.placementError = null
        },

        /**
         * Confirmation de la combo par le joueur actif.
         * Calcule immédiatement toutes les combos valides et les stocke dans validCombos.
         */
        confirmActiveCombo(
            colorDiceIndex: number,
            numberDiceIndex: number,
            jokerColor?: ColorKey,
            jokerCount?: number
        ) {
            if (this.phase !== 'active_selecting') return

            const colorVal = this.currentRoll?.colorDices[colorDiceIndex].value
            const numberVal = this.currentRoll?.numberDices[numberDiceIndex].value
            if (!colorVal || !numberVal) return

            const player = this.players.find(p => p.id === this.activePlayerId)
            if (!player) return

            const color = resolveColor(colorVal, jokerColor)
            const count = resolveCount(numberVal, jokerCount)
            if (!color || !count) return

            let jokersNeeded = 0
            if (colorVal === 'joker') jokersNeeded++
            if (numberVal === 'joker') jokersNeeded++

            if (jokersNeeded > 0 && player.jokersUsed + jokersNeeded > this.grid.jokers) {
                this.placementError = 'Plus assez de jokers disponibles !'
                return
            }

            player.jokersUsed += jokersNeeded
            player.confirmedCombo = { color, count }
            player.hasConfirmed = true
            this.activeSelection = { colorDiceIndex, numberDiceIndex }

            // Précalcul de toutes les combos valides
            player.validCombos = findAllValidCombos({
                cells: this.grid.cells,
                checkedCells: player.checkedCells,
                color,
                count,
                isFirstMove: player.checkedCells.size === 0,
            })

            this.phase = 'passive_selecting'
        },

        passActiveTurn() {
            if (this.phase !== 'active_selecting') return
            const player = this.players.find(p => p.id === this.activePlayerId)
            if (player) {
                player.hasPassed = true
                player.hasPlaced = true
            }

            this.activeSelection = null
            this.phase = 'passive_selecting'
        },

        /**
         * Confirmation de la combo par un joueur passif.
         * Calcule immédiatement toutes les combos valides pour ce joueur.
         */
        confirmPassiveCombo(
            playerId: string,
            colorDiceIndex: number,
            numberDiceIndex: number,
            jokerColor?: ColorKey,
            jokerCount?: number
        ) {
            if (this.phase !== 'passive_selecting') return

            const available = this.availableForPassive
            const colorVal = available.colorDices[colorDiceIndex]?.value
            const numberVal = available.numberDices[numberDiceIndex]?.value
            if (!colorVal || !numberVal) return

            const player = this.players.find(p => p.id === playerId)
            if (!player) return

            const color = resolveColor(colorVal, jokerColor)
            const count = resolveCount(numberVal, jokerCount)
            if (!color || !count) return

            let jokersNeeded = 0
            if (colorVal === 'joker') jokersNeeded++
            if (numberVal === 'joker') jokersNeeded++

            if (jokersNeeded > 0 && player.jokersUsed + jokersNeeded > this.grid.jokers) {
                this.placementError = 'Plus assez de jokers disponibles !'
                return
            }

            player.jokersUsed += jokersNeeded
            player.confirmedCombo = { color, count }
            player.hasConfirmed = true
            this.passiveSelections[playerId] = { colorDiceIndex, numberDiceIndex }

            // Précalcul de toutes les combos valides
            player.validCombos = findAllValidCombos({
                cells: this.grid.cells,
                checkedCells: player.checkedCells,
                color,
                count,
                isFirstMove: player.checkedCells.size === 0,
            })
        },

        passPassiveTurn(playerId: string) {
            const player = this.players.find(p => p.id === playerId)
            if (player) {
                player.hasPassed = true
                player.hasPlaced = true
            }
            if (this.allPassiveDone) {
                this.phase = 'turn_end'
            }
        },

        // ── PLACEMENT ─────────────────────────────────────────────────────────────

        togglePendingCell(playerId: string, cellIdx: number) {
            const player = this.players.find(p => p.id === playerId)
            if (!player || !player.confirmedCombo) {
                this.placementError = "Confirme d'abord ta combinaison de dés"
                return
            }

            const { color, count } = player.confirmedCombo

            // Retirer si déjà pending (désélection)
            const pendingIndex = player.pendingCells.indexOf(cellIdx)
            if (pendingIndex !== -1) {
                player.pendingCells.splice(pendingIndex, 1)
                this.placementError = null
                return
            }

            // Vérifications de base
            if (this.grid.cells[cellIdx]?.[0] !== color) {
                this.placementError = 'Mauvaise couleur !'
                return
            }

            if (player.checkedCells.has(cellIdx)) {
                this.placementError = 'Cette case est déjà cochée'
                return
            }

            if (player.pendingCells.length >= count) {
                this.placementError = `Tu ne peux cocher que ${count} case(s)`
                return
            }

            // Vérification via les combos pré-calculées
            const selectable = getSelectableCells(player.validCombos, player.pendingCells)
            if (!selectable.has(cellIdx)) {
                this.placementError = 'Cette case ne peut pas être cochée ici'
                return
            }

            player.pendingCells.push(cellIdx)
            this.placementError = null
        },

        confirmPendingCells(playerId: string) {
            const player = this.players.find(p => p.id === playerId)
            if (!player || !player.confirmedCombo) return

            const { color, count } = player.confirmedCombo
            const isFirstMove = player.checkedCells.size === 0

            const validation = validatePlacement(player.pendingCells, {
                cells: this.grid.cells,
                checkedCells: player.checkedCells,
                color,
                count,
                isFirstMove,
            })

            if (!validation.valid) {
                this.placementError = validation.reason ?? 'Placement invalide'
                return
            }

            player.pendingCells.forEach(idx => player.checkedCells.add(idx))
            player.pendingCells = []
            player.validCombos = []
            player.hasPlaced = true
            this.placementError = null

            this.checkColorCompletion(player)
            this.checkColumnCompletion(player)
            this.checkGameOver()

            // Tours 1–3 : le joueur actif aussi déclenche la fin de tour
            const isNormalActiveTurn = this.turnNumber >= 3 && player.id === this.activePlayerId
            if (!isNormalActiveTurn && this.allPassiveDone) {
                this.phase = 'turn_end'
            }
        },

        cancelPendingCells(playerId: string) {
            const player = this.players.find(p => p.id === playerId)
            if (!player) return
            player.pendingCells = []
            this.placementError = null
        },

        toggleCell(playerId: string, cellIdx: number) {
            this.togglePendingCell(playerId, cellIdx)
        },

        useJoker(playerId: string) {
            const player = this.players.find(p => p.id === playerId)
            if (!player || player.jokersUsed >= this.grid.jokers) return
            player.jokersUsed++
        },

        checkColorCompletion(player: PlayerState) {
            const colorTotals: Record<string, number> = { g: 0, y: 0, b: 0, p: 0, o: 0 }
            const colorChecked: Record<string, number> = { g: 0, y: 0, b: 0, p: 0, o: 0 }
            this.grid.cells.forEach(([color], idx) => {
                colorTotals[color]++
                if (player.checkedCells.has(idx)) colorChecked[color]++
            })
            Object.keys(colorTotals).forEach(color => {
                const c = color as ColorKey
                if (colorChecked[c] === colorTotals[c] && player.colorBonus[c] === null) {
                    const otherCompleted = this.players.some(
                        p => p.id !== player.id && p.colorBonus[c] !== null
                    )
                    player.colorBonus[c] = otherCompleted ? 'others' : 'first'
                    this.completionQueue.push({ playerId: player.id, color: c })
                }
            })
        },

        checkColumnCompletion(player: PlayerState) {
            ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'].forEach((col, ci) => {
                if (player.columnBonus[col] !== null) return
                const complete = Array.from({ length: 7 }, (_, row) => row * 15 + ci)
                    .every(idx => player.checkedCells.has(idx))
                if (complete) {
                    const otherCompleted = this.players.some(
                        p => p.id !== player.id && p.columnBonus[col] !== null
                    )
                    player.columnBonus[col] = otherCompleted ? 'others' : 'first'
                    const points = otherCompleted
                        ? COLUMN_POINTS[col].others
                        : COLUMN_POINTS[col].first
                    this.columnCompletionQueue.push({ playerId: player.id, column: col, points })
                }
            })
        },

        checkGameOver() {
            this.players.forEach(player => {
                const completedColors = Object.values(player.colorBonus)
                    .filter(v => v !== null).length
                if (completedColors >= 2) this.gameOver = true
            })
        },

        nextTurn() {
            if (this.phase !== 'turn_end') return
            if (this.gameOver) return

            // Sécurité : flush les pending non confirmées
            this.players.forEach(p => {
                if (p.pendingCells.length > 0) {
                    p.pendingCells.forEach(idx => p.checkedCells.add(idx))
                    p.pendingCells = []
                }
                p.validCombos = []
            })

            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length
            this.activePlayerId = this.players[this.currentPlayerIndex].id
            this.turnNumber++
            this.phase = 'waiting_roll'
            this.currentRoll = null
            this.activeSelection = null
            this.passiveSelections = {}
            this.placementError = null
        },

        popCompletionQueue() {
            this.completionQueue.shift()
        },

        popColumnCompletionQueue() {
            this.columnCompletionQueue.shift()
        },

        resetGame() {
            this.players = this.players.map(p => createPlayer(p.id, p.name))
            this.currentPlayerIndex = 0
            this.turnNumber = 0
            this.gameOver = false
            this.activePlayerId = this.players[0].id
            this.phase = 'waiting_roll'
            this.currentRoll = null
            this.activeSelection = null
            this.passiveSelections = {}
            this.placementError = null
            this.completionQueue = []
            this.columnCompletionQueue = []
        },
    },
})