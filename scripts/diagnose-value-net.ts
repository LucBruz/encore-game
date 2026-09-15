/**
 * Pourquoi le reseau de valeur joue-t-il moins bien qu'il ne predit ?
 *
 *   npx tsx scripts/diagnose-value-net.ts --games 40
 *
 * Mesure, sur des decisions reelles d'une table de v3-multi (graines d'evaluation) :
 *   - accord : le reseau choisit-il le meme coup que v3 ?
 *   - correlation de rang entre les deux classements des candidats ;
 *   - ecart de valeur que le reseau voit entre ses candidats, a comparer a son
 *     erreur de prediction (RMSE 6,4) ;
 *   - ce que vaut pour lui un joker de plus depense, a position egale ;
 *   - la nature des desaccords (joker, passe, taille du coup).
 */
import { readFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { applyMove, cloneSheet } from '../engine/state'
import type { Move } from '../engine/state'
import { gridStats } from '../engine/scoring'
import { V3Scorer, makeGreedyV3Bot } from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { playMultiGame } from '../bots/playMulti'
import type { DecisionObservation } from '../bots/playMulti'
import { gridInfo, opponentCounts, summarizeOpponents } from '../bots/valueFeatures'
import { ValueNetEvaluator, loadValueNet } from '../bots/valueNet'

function arg(name: string, fallback: string): string {
    const k = process.argv.indexOf(`--${name}`)
    return k !== -1 && process.argv[k + 1] ? process.argv[k + 1] : fallback
}
const GAMES = Number(arg('games', '40'))
const NET = arg('net', 'public/data/value-net.json')

const vMulti: WeightsV3 = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
const net = loadValueNet(JSON.parse(readFileSync(NET, 'utf8')))
console.log(`reseau : ${NET}`)
const evaluator = new ValueNetEvaluator(net)

function ranks(xs: number[]): number[] {
    const order = xs.map((v, k) => [v, k]).sort((a, b) => a[0] - b[0])
    const r = new Array(xs.length)
    order.forEach(([, k], pos) => { r[k] = pos })
    return r
}
function spearman(a: number[], b: number[]): number {
    const ra = ranks(a), rb = ranks(b)
    const n = a.length
    const ma = (n - 1) / 2
    let num = 0, da = 0, db = 0
    for (let k = 0; k < n; k++) { num += (ra[k] - ma) * (rb[k] - ma); da += (ra[k] - ma) ** 2; db += (rb[k] - ma) ** 2 }
    return da && db ? num / Math.sqrt(da * db) : 0
}
const argmax = (xs: number[]) => xs.reduce((best, v, k) => (v > xs[best] ? k : best), 0)
const describe = (m: Move | null) => (m === null ? 'passe' : m.jokersSpent > 0 ? `joker x${m.jokersSpent}` : 'coup sans joker')

let decisions = 0, agree = 0, rho = 0, spread = 0, jokerDelta = 0, jokerN = 0
const disagreements = new Map<string, number>()
let netPlacedMore = 0, v3PlacedMore = 0

for (let g = 0; g < GAMES; g++) {
    const grid = ALL_GRIDS[g % ALL_GRIDS.length]
    const seen: DecisionObservation[] = []
    const bots = [0, 1, 2, 3].map(k => makeGreedyV3Bot(vMulti, `v3-${k}`))
    playMultiGame(grid.cells, bots, makeRng(5250000 + g * 7919), { observe: o => seen.push(o) })

    const info = gridInfo(grid.cells)
    const stats = gridStats(grid.cells)
    for (const o of seen) {
        if (o.candidates.length < 3 || o.turn < 3) continue
        const me = o.players[o.seat].sheet
        const others = o.players.filter((_, k) => k !== o.seat).map(p => p.sheet.mask)
        const counts = opponentCounts(others)
        const summaries = summarizeOpponents(info, others)
        const isActive = o.seat === o.turn % o.players.length
        const scorer = new V3Scorer(grid.cells, me.mask, me.jokersUsed, stats, vMulti, 8, o.turn)

        const netValues: number[] = []
        const v3Values: number[] = []
        for (const m of o.candidates) {
            const s = cloneSheet(me)
            if (m) applyMove(s, m)
            netValues.push(evaluator.evaluate(info, s.mask, s.jokersUsed, counts, summaries, o.turn, isActive, 8)[0])
            v3Values.push(m ? scorer.scoreAfter(m) : scorer.value)
        }

        decisions++
        const a = argmax(netValues), b = argmax(v3Values)
        if (a === b) agree++
        else {
            const key = `reseau: ${describe(o.candidates[a])} / v3: ${describe(o.candidates[b])}`
            disagreements.set(key, (disagreements.get(key) ?? 0) + 1)
            const na = o.candidates[a]?.placement.length ?? 0, nb = o.candidates[b]?.placement.length ?? 0
            if (na > nb) netPlacedMore++; else if (nb > na) v3PlacedMore++
        }
        rho += spearman(netValues, v3Values)
        spread += Math.max(...netValues) - Math.min(...netValues)

        if (me.jokersUsed < 8) {
            const base = evaluator.evaluate(info, me.mask, me.jokersUsed, counts, summaries, o.turn, isActive, 8)[0]
            const spent = evaluator.evaluate(info, me.mask, me.jokersUsed + 1, counts, summaries, o.turn, isActive, 8)[0]
            jokerDelta += spent - base
            jokerN++
        }
    }
}

console.log(`${decisions} decisions (tour >= 3, au moins 2 coups + passe), ${GAMES} parties de v3-multi`)
console.log(`  accord reseau / v3 sur le coup choisi : ${(100 * agree / decisions).toFixed(1)} %`)
console.log(`  correlation de rang moyenne (Spearman) : ${(rho / decisions).toFixed(3)}`)
console.log(`  ecart moyen max-min des valeurs du reseau entre candidats : ${(spread / decisions).toFixed(2)} points`)
console.log(`  un joker de plus depense, position egale : ${(jokerDelta / jokerN).toFixed(2)} point (score final = 1 point par joker restant)`)
console.log(`  desaccords : le reseau coche plus ${netPlacedMore} fois, v3 coche plus ${v3PlacedMore} fois`)
for (const [k, n] of [...disagreements].sort((x, y) => y[1] - x[1])) console.log(`    ${String(n).padStart(4)}  ${k}`)
