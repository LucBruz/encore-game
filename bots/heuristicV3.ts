import { COLUMN_POINTS, COLS } from '../app/data/grids/grid-01'
import { CELL_COUNT, COL_OF, GRID_COLS, GRID_ROWS, NEIGHBORS, START_COL } from '../engine/grid'
import { COLOR_KEYS } from '../engine/scoring'
import type { Move } from '../engine/state'
import { DEFAULT_TOTAL_JOKERS } from '../engine/state'
import type { Cells, CheckedMask, ColorKey } from '../engine/types'
import { gridStats } from './heuristic'
import type { GridStats } from './heuristic'
import type { Bot, TurnContext } from './types'

/**
 * Heuristique v3 — features dictees par un joueur, pas devinees.
 *
 * La v2 avait ajoute des compteurs PLATS (frontiere, couleurs vivantes) et avait
 * echoue. Ce que la forme a 6 parametres ne peut pas exprimer, ce n'est pas "plus
 * de compteurs", c'est deux choses precises :
 *
 *   FORME   — quelles cases, pas seulement combien. Laisser une case isolee la rend
 *             injouable sauf avec un « 1 » exact : c'est une perte seche que les
 *             compteurs par couleur et par colonne ne voient pas.
 *   TIMING  — le meme etat ne vaut pas pareil au tour 3 et au tour 30. Ouvrir des
 *             possibilites compte tot ; les couleurs comptent tard.
 *
 * Les blocs de couleur des grilles officielles font au plus 6 cases, donc compter
 * les composantes isolees reste tres bon marche.
 */
export interface WeightsV3 {
    // ── Colonnes ──────────────────────────────────────────────────────────────
    columnExponent: number
    /** Bonus sur les colonnes extremes (A, O), decroissant avec le tour. */
    extremeColumnEarly: number

    // ── Couleurs, valeur croissante avec le tour ─────────────────────────────
    colorExponent: number
    colorValueEarly: number
    colorValueLate: number

    // ── Forme ────────────────────────────────────────────────────────────────
    /** Penalite par case encore cochable mais isolee (composante de taille 1). */
    orphan1: number
    /** Penalite par composante de taille 2 : ne se remplit qu'avec un 1+1 ou un 2. */
    orphan2: number

    // ── Expansion precoce ────────────────────────────────────────────────────
    /** Valeur d'une case ancrable, decroissante avec le tour. */
    frontierEarly: number

    // ── Ressources ───────────────────────────────────────────────────────────
    jokerValue: number
    starValue: number
    cellValue: number

    // ── Horizons de phase ────────────────────────────────────────────────────
    /** Tour au-dela duquel les termes "tot" ne valent plus rien. */
    earlyHorizon: number
    /** Tour a partir duquel les couleurs valent leur poids tardif. */
    lateHorizon: number
}

const COLUMN_VALUE: number[] = COLS.map(c => (COLUMN_POINTS[c].first + COLUMN_POINTS[c].others) / 2)
const IS_EXTREME: boolean[] = COLS.map((_, i) => i === 0 || i === GRID_COLS - 1)

export const DEFAULT_WEIGHTS_V3: WeightsV3 = {
    columnExponent: 2.777,
    extremeColumnEarly: 1,
    colorExponent: 0.529,
    colorValueEarly: 0.5,
    colorValueLate: 3,
    orphan1: 1.5,
    orphan2: 0.4,
    frontierEarly: 0.3,
    jokerValue: 3.678,
    starValue: 2.033,
    cellValue: 0.034,
    earlyHorizon: 12,
    lateHorizon: 25,
}

export const V3_KEYS: (keyof WeightsV3)[] = [
    'columnExponent', 'extremeColumnEarly', 'colorExponent', 'colorValueEarly', 'colorValueLate',
    'orphan1', 'orphan2', 'frontierEarly', 'jokerValue', 'starValue', 'cellValue',
    'earlyHorizon', 'lateHorizon',
]

export function weightsV3ToVec(w: WeightsV3): number[] {
    return V3_KEYS.map(k => w[k])
}

export function vecToWeightsV3(v: number[]): WeightsV3 {
    const w = {} as WeightsV3
    V3_KEYS.forEach((k, i) => { w[k] = v[i] })
    return w
}

const colorIndex: Record<ColorKey, number> = { g: 0, y: 1, b: 2, p: 3, o: 4 }

/** 1 au tour 0, 0 a partir de `horizon`. Lineaire entre les deux. */
function earlyFactor(turn: number, horizon: number): number {
    if (horizon <= 0) return 0
    return Math.max(0, 1 - turn / horizon)
}

/** 0 au tour 0, 1 a partir de `horizon`. */
function lateFactor(turn: number, horizon: number): number {
    if (horizon <= 0) return 1
    return Math.min(1, turn / horizon)
}

/**
 * Evalue une feuille apres un coup. Les blocs faisant au plus 6 cases, on recalcule
 * la structure des composantes uniquement sur le bloc touche par le placement.
 */
export class V3Scorer {
    private readonly columnChecked = new Int32Array(GRID_COLS)
    private readonly checkedByColor = new Int32Array(5)
    private readonly anchorRaw = new Uint8Array(CELL_COUNT)
    private starsChecked = 0
    private cellsChecked = 0
    private frontier = 0
    private orphans1 = 0
    private orphans2 = 0
    private baseValue = 0
    private readonly colorValueNow: number
    private readonly earlyNow: number

    constructor(
        private readonly cells: Cells,
        private readonly mask: CheckedMask,
        private readonly jokersUsed: number,
        private readonly stats: GridStats,
        private readonly w: WeightsV3,
        private readonly totalJokers: number,
        turn: number,
    ) {
        this.earlyNow = earlyFactor(turn, w.earlyHorizon)
        const late = lateFactor(turn, w.lateHorizon)
        this.colorValueNow = w.colorValueEarly + (w.colorValueLate - w.colorValueEarly) * late

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
            if (anchored && !mask[i]) this.frontier++
        }

        const { ones, twos } = this.countSmallComponents(null)
        this.orphans1 = ones
        this.orphans2 = twos

        this.baseValue = this.computeFull()
    }

    /**
     * Compte les composantes de taille 1 et 2 dans le graphe des cases NON COCHEES
     * de meme couleur. `extra` est traite comme coche (simulation d'un placement).
     */
    private countSmallComponents(extra: Set<number> | null): { ones: number; twos: number } {
        const cells = this.cells
        const mask = this.mask
        const seen = new Uint8Array(CELL_COUNT)
        let ones = 0
        let twos = 0

        const isOpen = (i: number) => !mask[i] && !(extra && extra.has(i))

        for (let i = 0; i < CELL_COUNT; i++) {
            if (seen[i] || !isOpen(i)) continue
            const color = cells[i][0]
            // Parcours borne : un bloc de couleur fait au plus 6 cases.
            const stack = [i]
            seen[i] = 1
            let size = 0
            while (stack.length > 0) {
                const cur = stack.pop()!
                size++
                const n = NEIGHBORS[cur]
                for (let k = 0; k < n.length; k++) {
                    const u = n[k]
                    if (seen[u] || !isOpen(u) || cells[u][0] !== color) continue
                    seen[u] = 1
                    stack.push(u)
                }
            }
            if (size === 1) ones++
            else if (size === 2) twos++
        }
        return { ones, twos }
    }

    private computeFull(): number {
        const { w } = this
        let value = 0

        for (let col = 0; col < GRID_COLS; col++) {
            const ratio = this.columnChecked[col] / GRID_ROWS
            const progress = Math.pow(ratio, w.columnExponent)
            value += COLUMN_VALUE[col] * progress
            if (IS_EXTREME[col]) value += w.extremeColumnEarly * this.earlyNow * progress
        }

        for (const c of COLOR_KEYS) {
            const total = this.stats.colorTotals[c]
            if (!total) continue
            const ratio = this.checkedByColor[colorIndex[c]] / total
            value += this.colorValueNow * Math.pow(ratio, w.colorExponent)
        }

        value -= this.orphans1 * w.orphan1
        value -= this.orphans2 * w.orphan2
        value += this.frontier * w.frontierEarly * this.earlyNow
        value += this.starsChecked * w.starValue
        value += Math.max(0, this.totalJokers - this.jokersUsed) * w.jokerValue
        value += this.cellsChecked * w.cellValue

        return value
    }

    scoreAfter(move: Move): number {
        const { cells, mask, w } = this
        const placement = move.placement
        if (placement.length === 0) return this.baseValue

        let delta = 0

        const colDelta = new Map<number, number>()
        let stars = 0
        for (const idx of placement) {
            colDelta.set(COL_OF[idx], (colDelta.get(COL_OF[idx]) ?? 0) + 1)
            if (cells[idx][1]) stars++
        }
        for (const [col, add] of colDelta) {
            const before = this.columnChecked[col] / GRID_ROWS
            const after = (this.columnChecked[col] + add) / GRID_ROWS
            const pBefore = Math.pow(before, w.columnExponent)
            const pAfter = Math.pow(after, w.columnExponent)
            delta += COLUMN_VALUE[col] * (pAfter - pBefore)
            if (IS_EXTREME[col]) delta += w.extremeColumnEarly * this.earlyNow * (pAfter - pBefore)
        }

        const ci = colorIndex[move.color]
        const total = this.stats.colorTotals[move.color]
        if (total > 0) {
            const rBefore = this.checkedByColor[ci] / total
            const rAfter = (this.checkedByColor[ci] + placement.length) / total
            delta += this.colorValueNow
                * (Math.pow(rAfter, w.colorExponent) - Math.pow(rBefore, w.colorExponent))
        }

        delta += stars * w.starValue
        delta += placement.length * w.cellValue
        delta -= move.jokersSpent * w.jokerValue

        // Frontiere : seules les cases posees et leurs voisines changent d'etat.
        const inPlacement = new Set(placement)
        let frontierDelta = 0
        for (const idx of placement) if (this.anchorRaw[idx]) frontierDelta--
        const seen = new Set<number>()
        for (const idx of placement) {
            const n = NEIGHBORS[idx]
            for (let k = 0; k < n.length; k++) {
                const u = n[k]
                if (inPlacement.has(u) || mask[u] || this.anchorRaw[u] || seen.has(u)) continue
                seen.add(u)
                frontierDelta++
            }
        }
        delta += frontierDelta * w.frontierEarly * this.earlyNow

        // Composantes isolees : recalcul complet, mais borne par la taille des blocs.
        const after = this.countSmallComponents(inPlacement)
        delta -= (after.ones - this.orphans1) * w.orphan1
        delta -= (after.twos - this.orphans2) * w.orphan2

        return this.baseValue + delta
    }

    get value(): number {
        return this.baseValue
    }
}

export function makeGreedyV3Bot(w: WeightsV3 = DEFAULT_WEIGHTS_V3, name = 'greedy-v3'): Bot {
    const statsCache = new WeakMap<object, GridStats>()
    const statsFor = (cells: Cells): GridStats => {
        const key = cells as unknown as object
        let s = statsCache.get(key)
        if (!s) { s = gridStats(cells); statsCache.set(key, s) }
        return s
    }

    return {
        name,
        chooseMove({ cells, sheet, moves, totalJokers, turn }: TurnContext): Move | null {
            if (moves.length === 0) return null
            const scorer = new V3Scorer(
                cells, sheet.mask, sheet.jokersUsed, statsFor(cells), w, totalJokers, turn,
            )
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
