import { defineStore } from 'pinia'
import { GRID_01, COLUMN_POINTS, COLOR_MAP } from '~/data/grids/grid-01'
import type { ColorKey } from '~/data/grids/grid-01'

export interface PlayerState {
    id: string
    name: string
    checkedCells: Set<number>
    jokersUsed: number
    colorBonus: Record<ColorKey, 'first' | 'others' | null>
    columnBonus: Record<string, 'first' | 'others' | null>
}

function createPlayer(id: string, name: string): PlayerState {
    return {
        id,
        name,
        checkedCells: new Set(),
        jokersUsed: 0,
        colorBonus: { g: null, y: null, b: null, p: null, o: null },
        columnBonus: Object.fromEntries(
            ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'].map(c => [c, null])
        ),
    }
}

export const useGameStore = defineStore('game', {
    state: () => ({
        grid: GRID_01,
        players: [createPlayer('p1', 'Joueur 1')] as PlayerState[],
        currentPlayerIndex: 0,
        turnNumber: 0,
        gameOver: false,
        activePlayerId: 'p1',
    }),

    getters: {
        currentPlayer: (state): PlayerState => state.players[state.currentPlayerIndex],

        isActivePlayer: (state) => (playerId: string) => state.activePlayerId === playerId,

        // 3 premiers tours : tous les joueurs ont accès aux 6 dés
        isFirstThreeTurns: (state) => state.turnNumber < 3,

        cellsForColor: (state) => (colorKey: ColorKey) => {
            return state.grid.cells
                .map((cell, idx) => ({ ...cell, idx }))
                .filter(cell => cell[0] === colorKey)
        },

        // Score complet d'un joueur
        scoreForPlayer: (state) => (playerId: string) => {
            const player = state.players.find(p => p.id === playerId)
            if (!player) return 0

            const cells = state.grid.cells

            // Bonus couleurs
            let bonusTotal = 0
            Object.entries(player.colorBonus).forEach(([_, val]) => {
                if (val === 'first') bonusTotal += 5
                else if (val === 'others') bonusTotal += 3
            })

            // Points colonnes
            let colTotal = 0
                ;['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'].forEach((col, ci) => {
                    const val = player.columnBonus[col]
                    if (val === 'first') colTotal += COLUMN_POINTS[col].first
                    else if (val === 'others') colTotal += COLUMN_POINTS[col].others
                })

            // Jokers restants
            const jokersLeft = state.grid.jokers - player.jokersUsed

            // Malus étoiles non cochées
            let uncheckedStars = 0
            cells.forEach(([_, star], idx) => {
                if (star && !player.checkedCells.has(idx)) uncheckedStars++
            })

            return bonusTotal + colTotal + jokersLeft - (uncheckedStars * 2)
        },
    },

    actions: {
        addPlayer(name: string) {
            const id = `p${this.players.length + 1}`
            this.players.push(createPlayer(id, name))
        },

        toggleCell(playerId: string, cellIdx: number) {
            const player = this.players.find(p => p.id === playerId)
            if (!player) return

            if (player.checkedCells.has(cellIdx)) {
                player.checkedCells.delete(cellIdx)
            } else {
                player.checkedCells.add(cellIdx)
            }

            this.checkColorCompletion(player)
            this.checkColumnCompletion(player)
            this.checkGameOver()
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
                    // Vérifier si un autre joueur l'a déjà complété
                    const otherCompleted = this.players.some(
                        p => p.id !== player.id && p.colorBonus[c] !== null
                    )
                    player.colorBonus[c] = otherCompleted ? 'others' : 'first'
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
                }
            })
        },

        checkGameOver() {
            this.players.forEach(player => {
                const completedColors = Object.values(player.colorBonus)
                    .filter(v => v !== null).length
                if (completedColors >= 2) {
                    this.gameOver = true
                }
            })
        },

        nextTurn() {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length
            this.activePlayerId = this.players[this.currentPlayerIndex].id
            this.turnNumber++
        },

        resetGame() {
            this.players = this.players.map(p => createPlayer(p.id, p.name))
            this.currentPlayerIndex = 0
            this.turnNumber = 0
            this.gameOver = false
            this.activePlayerId = this.players[0].id
        },
    },
})