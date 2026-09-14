import { CELL_COUNT, COL_OF, GRID_COLS, GRID_ROWS, NEIGHBORS, START_COL } from '../engine/grid'
import type { Cells, CheckedMask, ColorKey } from '../engine/types'

/**
 * Entrees du reseau de valeur, calculees a UN seul endroit.
 *
 * La preparation des donnees (`scripts/featurize.ts`) et le bot en jeu
 * (`bots/valueNet.ts`) appellent ces fonctions. Python ne recalcule rien de
 * dense : il lit les valeurs ecrites ici et ne fait que deplier les masques en
 * plans creux, ce qu'un test de parite verifie. Deux implementations du meme
 * calcul divergeraient, et le reseau jouerait sur des entrees qu'il n'a jamais
 * vues a l'entrainement.
 *
 * Deux familles :
 *
 *   CREUSES (735) — une par (case, couleur) cochee, une par etoile cochee, et le
 *   nombre d'adversaires ayant coche chaque case. Elles alimentent une couche
 *   lineaire qu'on peut sommer sur les seules entrees actives, comme la premiere
 *   couche d'un NNUE : evaluer un coup candidat ne coute que quelques additions.
 *
 *   DENSES (61) — ce qu'une somme lineaire exprime mal : tour, jokers, avancement
 *   des couleurs et colonnes, bonus deja pris par les adversaires, proximite de la
 *   fin de partie pour chacun, et les termes de forme de la v3 (cases isolees,
 *   frontiere).
 *
 * Les bonus deja reclames sont deduits des masques, pas lus dans un etat de
 * partie : le bot en jeu ne recoit que les feuilles adverses (`TurnContext`).
 */

export const COLOR_INDEX: Record<ColorKey, number> = { g: 0, y: 1, b: 2, p: 3, o: 4 }
export const MAX_OPPONENTS = 3

export const SPARSE_CELL_COLOR = 0                        // cell * 5 + couleur
export const SPARSE_STAR = CELL_COUNT * 5                 // 525 + cell
export const SPARSE_OPPONENTS = CELL_COUNT * 6            // 630 + cell, valeur = part des adversaires
export const SPARSE_SIZE = CELL_COUNT * 7                 // 735
export const DENSE_SIZE = 61

export interface GridInfo {
    colorOf: Uint8Array
    star: Uint8Array
    colorTotals: Int32Array
}

const gridCache = new WeakMap<object, GridInfo>()

export function gridInfo(cells: Cells): GridInfo {
    const key = cells as unknown as object
    let info = gridCache.get(key)
    if (info) return info
    const colorOf = new Uint8Array(CELL_COUNT)
    const star = new Uint8Array(CELL_COUNT)
    const colorTotals = new Int32Array(5)
    for (let i = 0; i < CELL_COUNT; i++) {
        colorOf[i] = COLOR_INDEX[cells[i][0]]
        star[i] = cells[i][1] ? 1 : 0
        colorTotals[colorOf[i]]++
    }
    info = { colorOf, star, colorTotals }
    gridCache.set(key, info)
    return info
}

function checkedByColor(info: GridInfo, mask: CheckedMask): Int32Array {
    const out = new Int32Array(5)
    for (let i = 0; i < CELL_COUNT; i++) if (mask[i]) out[info.colorOf[i]]++
    return out
}

/** Cases qu'il reste a cocher pour completer ses deux couleurs les plus avancees. */
function remainingToTwoColors(info: GridInfo, checked: Int32Array): number {
    let a = Infinity, b = Infinity
    for (let c = 0; c < 5; c++) {
        const left = info.colorTotals[c] - checked[c]
        if (left < a) { b = a; a = left } else if (left < b) b = left
    }
    return a + b
}

function completedCount(info: GridInfo, checked: Int32Array): number {
    let n = 0
    for (let c = 0; c < 5; c++) if (checked[c] === info.colorTotals[c]) n++
    return n
}

function columnFull(mask: CheckedMask, col: number): boolean {
    for (let row = 0; row < GRID_ROWS; row++) if (!mask[row * GRID_COLS + col]) return false
    return true
}

/** Composantes de taille 1 et 2 parmi les cases non cochees de meme couleur (terme de forme de la v3). */
function smallComponents(info: GridInfo, mask: CheckedMask, seen: Uint8Array): [number, number] {
    seen.fill(0)
    let ones = 0, twos = 0
    const stack: number[] = []
    for (let i = 0; i < CELL_COUNT; i++) {
        if (seen[i] || mask[i]) continue
        const color = info.colorOf[i]
        seen[i] = 1
        stack.push(i)
        let size = 0
        while (stack.length) {
            const cur = stack.pop()!
            size++
            const n = NEIGHBORS[cur]
            for (let k = 0; k < n.length; k++) {
                const u = n[k]
                if (seen[u] || mask[u] || info.colorOf[u] !== color) continue
                seen[u] = 1
                stack.push(u)
            }
        }
        if (size === 1) ones++
        else if (size === 2) twos++
    }
    return [ones, twos]
}

function frontier(mask: CheckedMask): number {
    let n = 0
    for (let i = 0; i < CELL_COUNT; i++) {
        if (mask[i]) continue
        if (COL_OF[i] === START_COL) { n++; continue }
        const nb = NEIGHBORS[i]
        for (let k = 0; k < nb.length; k++) if (mask[nb[k]]) { n++; break }
    }
    return n
}

/** Nombre d'adversaires ayant coche chaque case. Identique pour tous les candidats d'une decision. */
export function opponentCounts(opponents: readonly CheckedMask[]): Uint8Array {
    const out = new Uint8Array(CELL_COUNT)
    for (const m of opponents) for (let i = 0; i < CELL_COUNT; i++) out[i] += m[i]
    return out
}

export interface OpponentSummary {
    remaining: number
    completed: number
    cells: number
    columnFull: Uint8Array
    colorDone: Uint8Array
}

/** Ce que les adversaires ont deja pris et a quelle distance ils sont de la fin. Commun aux candidats. */
export function summarizeOpponents(info: GridInfo, opponents: readonly CheckedMask[]): OpponentSummary[] {
    return opponents.map(m => {
        const checked = checkedByColor(info, m)
        const colorDone = new Uint8Array(5)
        for (let c = 0; c < 5; c++) colorDone[c] = checked[c] === info.colorTotals[c] ? 1 : 0
        const cols = new Uint8Array(GRID_COLS)
        for (let col = 0; col < GRID_COLS; col++) cols[col] = columnFull(m, col) ? 1 : 0
        let cells = 0
        for (let i = 0; i < CELL_COUNT; i++) cells += m[i]
        return {
            remaining: remainingToTwoColors(info, checked),
            completed: completedCount(info, checked),
            cells,
            columnFull: cols,
            colorDone,
        }
    })
}

const scratchSeen = new Uint8Array(CELL_COUNT)

/**
 * Entrees denses d'une feuille APRES le coup envisage, ecrites dans `out` a
 * partir de `offset`. `turn` est le tour du coup ; `opponents` les feuilles
 * adverses telles que le joueur les voit au moment de choisir.
 */
export function denseFeatures(
    info: GridInfo,
    mask: CheckedMask,
    jokersUsed: number,
    opponents: readonly OpponentSummary[],
    turn: number,
    isActive: boolean,
    totalJokers: number,
    out: Float32Array | Float64Array,
    offset = 0,
): void {
    let k = offset
    const checked = checkedByColor(info, mask)
    let cells = 0, starsLeft = 0
    for (let i = 0; i < CELL_COUNT; i++) {
        if (mask[i]) cells++
        else if (info.star[i]) starsLeft++
    }

    out[k++] = turn / 40
    out[k++] = isActive ? 1 : 0
    out[k++] = turn < 3 ? 1 : 0
    out[k++] = Math.max(0, totalJokers - jokersUsed) / 8
    out[k++] = cells / CELL_COUNT
    for (let c = 0; c < 5; c++) out[k++] = info.colorTotals[c] ? checked[c] / info.colorTotals[c] : 0
    out[k++] = completedCount(info, checked) / 2
    out[k++] = remainingToTwoColors(info, checked) / 30
    for (let col = 0; col < GRID_COLS; col++) {
        let n = 0
        for (let row = 0; row < GRID_ROWS; row++) n += mask[row * GRID_COLS + col]
        out[k++] = n / GRID_ROWS
    }
    for (let col = 0; col < GRID_COLS; col++) {
        let taken = 0
        for (const o of opponents) if (o.columnFull[col]) { taken = 1; break }
        out[k++] = taken
    }
    for (let c = 0; c < 5; c++) {
        let taken = 0
        for (const o of opponents) if (o.colorDone[c]) { taken = 1; break }
        out[k++] = taken
    }
    out[k++] = starsLeft / 15
    out[k++] = frontier(mask) / 30
    const [ones, twos] = smallComponents(info, mask, scratchSeen)
    out[k++] = ones / 10
    out[k++] = twos / 10

    // Adversaires, du plus proche de finir au plus lointain : l'ordre des sieges ne
    // doit pas compter, la menace de fin de partie si.
    const sorted = [...opponents].sort((a, b) => a.remaining - b.remaining || b.completed - a.completed || b.cells - a.cells)
    for (let j = 0; j < MAX_OPPONENTS; j++) out[k++] = j < sorted.length ? sorted[j].remaining / 30 : 1
    for (let j = 0; j < MAX_OPPONENTS; j++) out[k++] = j < sorted.length ? sorted[j].completed / 2 : 0
    for (let j = 0; j < MAX_OPPONENTS; j++) out[k++] = j < sorted.length ? sorted[j].cells / CELL_COUNT : 0
    out[k++] = opponents.length / MAX_OPPONENTS

    if (k - offset !== DENSE_SIZE) throw new Error(`denseFeatures: ${k - offset} valeurs, ${DENSE_SIZE} attendues`)
}
