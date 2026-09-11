import { COLUMN_POINTS, COLS } from '../../app/data/grids/grid-01'
import { CELL_COUNT, COL_OF, GRID_COLS, GRID_ROWS, NEIGHBORS, START_COL } from '../../engine/grid'
import { COLOR_KEYS } from '../../engine/scoring'
import type { Move } from '../../engine/state'
import { DEFAULT_TOTAL_JOKERS } from '../../engine/state'
import type { Cells, CheckedMask, ColorKey } from '../../engine/types'
import { gridStats } from './heuristic'
import type { GridStats } from './heuristic'
import type { Bot, TurnContext } from '../types'

/**
 * Heuristique v2 — teste si la FORME de la v1 etait limitante.
 *
 * Trois choses que la v1 ne pouvait pas exprimer :
 *
 * 1. `columnTable` / `colorTable` : une valeur libre par niveau d'avancement, au
 *    lieu d'un unique exposant. La v1 imposait une courbe ratio^k ; ici CEM peut
 *    apprendre que 6 cases sur 7 vaut disproportionnellement plus que 5.
 * 2. `frontier` : nombre de cases actuellement ancrables — la mesure directe de
 *    "garder des options ouvertes", que la v1 ne captait qu'indirectement.
 * 3. `colorAlive` : nombre de couleurs ayant encore au moins une case ancrable.
 *    Perdre l'acces a une couleur est irreversible et invisible pour la v1.
 */
export interface WeightsV2 {
    /** 8 valeurs, indexees par nombre de cases cochees dans la colonne (0..7). */
    columnTable: number[]
    /** 8 valeurs, indexees par tranche d'avancement de la couleur (0..7). */
    colorTable: number[]
    frontier: number
    colorAlive: number
    star: number
    joker: number
    cell: number
}

const COLUMN_VALUE: number[] = COLS.map(c => (COLUMN_POINTS[c].first + COLUMN_POINTS[c].others) / 2)

export const DEFAULT_WEIGHTS_V2: WeightsV2 = {
    // Depart approximant la v1 optimisee : (k/7)^2.777 et 1.075*(k/7)^0.529
    columnTable: Array.from({ length: 8 }, (_, k) => Math.pow(k / 7, 2.777)),
    colorTable: Array.from({ length: 8 }, (_, k) => 1.075 * Math.pow(k / 7, 0.529)),
    frontier: 0.1,
    colorAlive: 0.5,
    star: 2.03,
    joker: 3.68,
    cell: 0.034,
}

export const V2_PARAM_COUNT = 8 + 8 + 5

export function weightsV2ToVec(w: WeightsV2): number[] {
    return [...w.columnTable, ...w.colorTable, w.frontier, w.colorAlive, w.star, w.joker, w.cell]
}

export function vecToWeightsV2(v: number[]): WeightsV2 {
    return {
        columnTable: v.slice(0, 8),
        colorTable: v.slice(8, 16),
        frontier: v[16],
        colorAlive: v[17],
        star: v[18],
        joker: v[19],
        cell: v[20],
    }
}

const colorIndex: Record<ColorKey, number> = { g: 0, y: 1, b: 2, p: 3, o: 4 }

function colorBucket(checked: number, total: number): number {
    if (total <= 0) return 0
    return Math.min(7, Math.floor((checked / total) * 7.999))
}

/**
 * Etat agrege d'une feuille, calcule UNE FOIS par tour. Chaque coup candidat est
 * ensuite evalue par delta local : un placement ne touche que ses propres cases et
 * leurs voisines, donc recalculer la frontiere sur les 105 cases par candidat
 * coutait ~25x trop cher (c'est ce qui rendait le reglage v2 inexploitable).
 */
export class V2Scorer {
    private readonly columnChecked = new Int32Array(GRID_COLS)
    private readonly checkedByColor = new Int32Array(5)
    /** Ancrable en ignorant l'etat coche/non coche : colonne H, ou voisin coche. */
    private readonly anchorRaw = new Uint8Array(CELL_COUNT)
    private readonly frontierByColor = new Int32Array(5)
    private starsChecked = 0
    private cellsChecked = 0
    private frontier = 0
    private baseValue = 0

    constructor(
        private readonly cells: Cells,
        private readonly mask: CheckedMask,
        private readonly jokersUsed: number,
        private readonly stats: GridStats,
        private readonly w: WeightsV2,
        private readonly totalJokers: number,
    ) {
        for (let i = 0; i < CELL_COUNT; i++) {
            if (mask[i]) {
                this.cellsChecked++
                this.columnChecked[COL_OF[i]]++
                this.checkedByColor[colorIndex[cells[i][0]]]++
                if (cells[i][1]) this.starsChecked++
            }
        }

        for (let i = 0; i < CELL_COUNT; i++) {
            let anchored = COL_OF[i] === START_COL ? 1 : 0
            if (!anchored) {
                const n = NEIGHBORS[i]
                for (let k = 0; k < n.length; k++) if (mask[n[k]]) { anchored = 1; break }
            }
            this.anchorRaw[i] = anchored
            if (anchored && !mask[i]) {
                this.frontier++
                this.frontierByColor[colorIndex[cells[i][0]]]++
            }
        }

        this.baseValue = this.computeFull()
    }

    /** Valeur de la feuille telle quelle, sans coup. */
    get value(): number {
        return this.baseValue
    }

    private computeFull(): number {
        const { w } = this
        let value = 0
        for (let col = 0; col < GRID_COLS; col++) {
            value += COLUMN_VALUE[col] * w.columnTable[this.columnChecked[col]]
        }
        for (const c of COLOR_KEYS) {
            const ci = colorIndex[c]
            value += w.colorTable[colorBucket(this.checkedByColor[ci], this.stats.colorTotals[c])]
        }
        let alive = 0
        for (let i = 0; i < 5; i++) if (this.frontierByColor[i] > 0) alive++

        value += this.frontier * w.frontier
        value += alive * w.colorAlive
        value += this.starsChecked * w.star
        value += Math.max(0, this.totalJokers - this.jokersUsed) * w.joker
        value += this.cellsChecked * w.cell
        return value
    }

    /** Valeur de la feuille apres application du coup, sans muter l'etat de base. */
    scoreAfter(move: Move): number {
        const { cells, mask, w } = this
        const placement = move.placement
        let delta = 0

        // Colonnes touchees
        const colDelta = new Map<number, number>()
        let stars = 0
        for (const idx of placement) {
            colDelta.set(COL_OF[idx], (colDelta.get(COL_OF[idx]) ?? 0) + 1)
            if (cells[idx][1]) stars++
        }
        for (const [col, add] of colDelta) {
            const before = this.columnChecked[col]
            delta += COLUMN_VALUE[col] * (w.columnTable[before + add] - w.columnTable[before])
        }

        // Couleur du coup
        const ci = colorIndex[move.color]
        const total = this.stats.colorTotals[move.color]
        const beforeChecked = this.checkedByColor[ci]
        delta += w.colorTable[colorBucket(beforeChecked + placement.length, total)]
            - w.colorTable[colorBucket(beforeChecked, total)]

        delta += stars * w.star
        delta += placement.length * w.cell
        delta -= move.jokersSpent * w.joker

        // Frontiere : seules les cases du placement et leurs voisines changent d'etat.
        const inPlacement = new Set(placement)
        let frontierDelta = 0
        const colorFrontierDelta = new Int32Array(5)

        // Les cases posees quittent la frontiere si elles y etaient.
        for (const idx of placement) {
            if (this.anchorRaw[idx]) {
                frontierDelta--
                colorFrontierDelta[colorIndex[cells[idx][0]]]--
            }
        }

        // Les voisines non cochees et pas encore ancrees le deviennent.
        const seen = new Set<number>()
        for (const idx of placement) {
            const n = NEIGHBORS[idx]
            for (let k = 0; k < n.length; k++) {
                const u = n[k]
                if (inPlacement.has(u) || mask[u] || this.anchorRaw[u] || seen.has(u)) continue
                seen.add(u)
                frontierDelta++
                colorFrontierDelta[colorIndex[cells[u][0]]]++
            }
        }

        delta += frontierDelta * w.frontier

        let aliveBefore = 0
        let aliveAfter = 0
        for (let i = 0; i < 5; i++) {
            if (this.frontierByColor[i] > 0) aliveBefore++
            if (this.frontierByColor[i] + colorFrontierDelta[i] > 0) aliveAfter++
        }
        delta += (aliveAfter - aliveBefore) * w.colorAlive

        return this.baseValue + delta
    }
}

export function makeGreedyV2Bot(w: WeightsV2 = DEFAULT_WEIGHTS_V2, name = 'greedy-v2'): Bot {
    const statsCache = new WeakMap<object, GridStats>()
    const statsFor = (cells: Cells): GridStats => {
        const key = cells as unknown as object
        let s = statsCache.get(key)
        if (!s) { s = gridStats(cells); statsCache.set(key, s) }
        return s
    }

    return {
        name,
        chooseMove({ cells, sheet, moves, totalJokers }: TurnContext): Move | null {
            if (moves.length === 0) return null
            const scorer = new V2Scorer(cells, sheet.mask, sheet.jokersUsed, statsFor(cells), w, totalJokers)
            let best: Move | null = null
            let bestValue = -Infinity
            for (const move of moves) {
                const value = scorer.scoreAfter(move)
                if (value > bestValue) { bestValue = value; best = move }
            }
            return best
        },
    }
}

/** Valeur brute d'une feuille, sans coup — recalcul complet, sert de reference. */
export function evaluateV2(
    cells: Cells,
    mask: CheckedMask,
    jokersUsed: number,
    stats: GridStats,
    w: WeightsV2,
    totalJokers = DEFAULT_TOTAL_JOKERS,
): number {
    return new V2Scorer(cells, mask, jokersUsed, stats, w, totalJokers).value
}
