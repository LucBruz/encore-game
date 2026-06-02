import type { ColorKey } from '~/data/grids/grid-01'

export const GRID_COLS = 15
export const GRID_ROWS = 7

// ─── HELPERS GRILLE ──────────────────────────────────────────────────────────

export function cellIndex(row: number, col: number): number {
    return row * GRID_COLS + col
}

export function cellCoords(idx: number): { row: number; col: number } {
    return {
        row: Math.floor(idx / GRID_COLS),
        col: idx % GRID_COLS,
    }
}

// Voisins directs (haut, bas, gauche, droite)
export function getNeighbors(idx: number): number[] {
    const { row, col } = cellCoords(idx)
    const neighbors: number[] = []
    if (row > 0) neighbors.push(cellIndex(row - 1, col))
    if (row < GRID_ROWS - 1) neighbors.push(cellIndex(row + 1, col))
    if (col > 0) neighbors.push(cellIndex(row, col - 1))
    if (col < GRID_COLS - 1) neighbors.push(cellIndex(row, col + 1))
    return neighbors
}

// ─── BLOCS CONTIGUS ───────────────────────────────────────────────────────────

export function getContiguousBlock(
    startIdx: number,
    color: ColorKey,
    cells: [ColorKey, boolean][]
): Set<number> {
    const block = new Set<number>()
    const queue = [startIdx]

    while (queue.length > 0) {
        const current = queue.shift()!
        if (block.has(current)) continue
        if (cells[current]?.[0] !== color) continue
        block.add(current)
        getNeighbors(current).forEach(n => {
            if (!block.has(n) && cells[n]?.[0] === color) {
                queue.push(n)
            }
        })
    }

    return block
}

// ─── CASES COCHABLES ─────────────────────────────────────────────────────────

export interface PlacementContext {
    cells: [ColorKey, boolean][]
    checkedCells: Set<number>
    color: ColorKey
    count: number
    isFirstMove: boolean
}

/**
 * Calcule TOUTES les combinaisons valides complètes au moment de la confirmation
 * de la combo de dés. À stocker dans player.validCombos.
 */
export function findAllValidCombos(ctx: PlacementContext): number[][] {
    return findPlacementCandidates(ctx)
}

/**
 * À chaque clic sur une case, filtre les combos compatibles avec les cases
 * déjà sélectionnées (pendingCells) et retourne uniquement les cases
 * encore cliquables parmi ces combos filtrés.
 *
 * @param allCombos   - toutes les combos valides calculées au départ
 * @param pendingCells - cases déjà sélectionnées par le joueur ce tour
 */
export function getSelectableCells(
    allCombos: number[][],
    pendingCells: number[]
): Set<number> {
    // Filtrer les combos qui contiennent TOUTES les cases déjà sélectionnées
    const compatibleCombos = allCombos.filter(combo =>
        pendingCells.every(p => combo.includes(p))
    )

    // Retourner l'union des cases restantes dans ces combos compatibles
    const selectable = new Set<number>()
    compatibleCombos.forEach(combo =>
        combo.forEach(idx => {
            if (!pendingCells.includes(idx)) selectable.add(idx)
        })
    )
    return selectable
}

export function getValidCellsToCheck(ctx: PlacementContext): Set<number> {
    const validCells = new Set<number>()
    const candidates = findPlacementCandidates(ctx)
    candidates.forEach(combo => combo.forEach(idx => validCells.add(idx)))
    return validCells
}

export function findPlacementCandidates(ctx: PlacementContext): number[][] {
    const { cells, checkedCells, color, count, isFirstMove } = ctx
    const results: number[][] = []

    const startCells = getPossibleStartCells(cells, checkedCells, color, isFirstMove)

    startCells.forEach(startIdx => {
        const block = getContiguousBlock(startIdx, color, cells)
        const availableInBlock = [...block].filter(idx => !checkedCells.has(idx))

        if (availableInBlock.length < count) return

        const combos = findContiguousCombos(startIdx, count, availableInBlock, block)
        combos.forEach(combo => {
            if (isValidPlacement(combo, checkedCells, isFirstMove)) {
                results.push(combo)
            }
        })
    })

    const seen = new Set<string>()
    return results.filter(combo => {
        const key = [...combo].sort().join(',')
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function getPossibleStartCells(
    cells: [ColorKey, boolean][],
    checkedCells: Set<number>,
    color: ColorKey,
    isFirstMove: boolean
): number[] {
    const starts: number[] = []

    cells.forEach((cell, idx) => {
        if (cell[0] !== color) return
        if (checkedCells.has(idx)) return

        const { col } = cellCoords(idx)

        if (isFirstMove) {
            if (col === 7) starts.push(idx)
        } else {
            const neighbors = getNeighbors(idx)
            const isAdjacentToChecked = neighbors.some(n => checkedCells.has(n))
            if (isAdjacentToChecked) starts.push(idx)
        }
    })

    return starts
}

function findContiguousCombos(
    startIdx: number,
    count: number,
    available: number[],
    _block: Set<number>
): number[][] {
    if (count === 1) return [[startIdx]]

    const others = available.filter(c => c !== startIdx)
    const results: number[][] = []
    const needed = count - 1

    function pick(chosen: number[], startPos: number) {
        if (chosen.length === needed) {
            const subset = [startIdx, ...chosen]
            if (areCellsContiguous(subset)) results.push(subset)
            return
        }
        const remaining = needed - chosen.length
        for (let i = startPos; i <= others.length - remaining; i++) {
            chosen.push(others[i])
            pick(chosen, i + 1)
            chosen.pop()
        }
    }

    pick([], 0)
    return results
}

function isValidPlacement(
    combo: number[],
    checkedCells: Set<number>,
    isFirstMove: boolean
): boolean {
    if (isFirstMove) {
        return combo.some(idx => cellCoords(idx).col === 7)
    }
    return combo.some(idx =>
        getNeighbors(idx).some(n => checkedCells.has(n))
    )
}

// ─── VALIDATION D'UN PLACEMENT PROPOSÉ ───────────────────────────────────────

export interface PlacementValidation {
    valid: boolean
    reason?: string
}

export function validatePlacement(
    selectedIndices: number[],
    ctx: PlacementContext
): PlacementValidation {
    const { cells, checkedCells, color, count, isFirstMove } = ctx

    if (selectedIndices.length !== count) {
        return { valid: false, reason: `Tu dois cocher exactement ${count} case(s)` }
    }

    for (const idx of selectedIndices) {
        if (cells[idx]?.[0] !== color) {
            return { valid: false, reason: `Toutes les cases doivent être de couleur ${color}` }
        }
        if (checkedCells.has(idx)) {
            return { valid: false, reason: 'Cette case est déjà cochée' }
        }
    }

    if (!areCellsContiguous(selectedIndices)) {
        return { valid: false, reason: 'Les cases doivent être contiguës (horizontalement ou verticalement)' }
    }

    const block = getContiguousBlock(selectedIndices[0], color, cells)
    if (!selectedIndices.every(idx => block.has(idx))) {
        return { valid: false, reason: 'Toutes les cases doivent être dans le même bloc de couleur' }
    }

    if (isFirstMove) {
        if (!selectedIndices.some(idx => cellCoords(idx).col === 7)) {
            return { valid: false, reason: 'Le premier coup doit inclure une case en colonne H' }
        }
        return { valid: true }
    }

    const isAdjacent = selectedIndices.some(idx =>
        getNeighbors(idx).some(n => checkedCells.has(n))
    )
    if (!isAdjacent) {
        return { valid: false, reason: 'Les cases doivent être adjacentes à une case déjà cochée' }
    }

    return { valid: true }
}

function areCellsContiguous(indices: number[]): boolean {
    if (indices.length <= 1) return true
    const indexSet = new Set(indices)
    const visited = new Set<number>()
    const queue = [indices[0]]

    while (queue.length > 0) {
        const current = queue.shift()!
        if (visited.has(current)) continue
        visited.add(current)
        getNeighbors(current).forEach(n => {
            if (indexSet.has(n) && !visited.has(n)) queue.push(n)
        })
    }

    return visited.size === indices.length
}