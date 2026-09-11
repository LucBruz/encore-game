/**
 * Compare l'ancien enumerateur (app/utils/gameRules.ts) au nouveau (engine/placement.ts).
 *   corepack pnpm bench
 */
import { GRID_01 } from '../app/data/grids/grid-01'
import type { ColorKey } from '../app/data/grids/grid-01'
import { findPlacementCandidates } from '../app/utils/gameRules'
import { legalPlacements } from '../engine/placement'
import { createMask } from '../engine/mask'
import { CELL_COUNT } from '../engine/grid'
import { makeRng } from '../engine/__tests__/fixtures'

const COLORS: ColorKey[] = ['g', 'y', 'b', 'p', 'o']

function buildMidGame(seed: number, density: number) {
    const rng = makeRng(seed)
    const mask = createMask()
    const checked = new Set<number>()
    for (let i = 0; i < CELL_COUNT; i++) {
        if (rng() < density) { mask[i] = 1; checked.add(i) }
    }
    return { mask, checked }
}

function time(label: string, fn: () => number): { label: string; ms: number; results: number } {
    const t0 = performance.now()
    const results = fn()
    const ms = performance.now() - t0
    return { label, ms, results }
}

const rows: string[] = []
console.log('Grille 01, masque aleatoire densite 0.25, toutes couleurs x counts 1..5\n')

for (const density of [0.0, 0.25, 0.5]) {
    const { mask, checked } = buildMidGame(42, density)

    const oldRun = time('ancien', () => {
        let n = 0
        for (const color of COLORS) {
            for (let count = 1; count <= 5; count++) {
                n += findPlacementCandidates({
                    cells: GRID_01.cells, checkedCells: checked, color, count,
                    isFirstMove: checked.size === 0,
                }).length
            }
        }
        return n
    })

    const newRun = time('nouveau', () => {
        let n = 0
        for (const color of COLORS) {
            for (let count = 1; count <= 5; count++) {
                n += legalPlacements(GRID_01.cells, mask, color, count).length
            }
        }
        return n
    })

    const speedup = oldRun.ms / newRun.ms
    rows.push(
        `densite ${density.toFixed(2)} | ancien ${oldRun.ms.toFixed(1)} ms (${oldRun.results} placements)`
        + ` | nouveau ${newRun.ms.toFixed(1)} ms (${newRun.results} placements)`
        + ` | x${speedup.toFixed(0)}`,
    )
    console.log(rows[rows.length - 1])
}

console.log('\nNote : les comptes different, l ancien enumerateur ignore la regle de la colonne H permanente.')
