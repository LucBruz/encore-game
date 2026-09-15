/**
 * Quand le reseau de valeur et v3-multi ne choisissent pas le meme coup, qui a raison ?
 *
 *   npx tsx scripts/check-disagreements.ts --net training/runs/rollouts/value-net.json --max 300
 *   npx tsx scripts/check-disagreements.ts --net ... --table net     # positions des parties du reseau
 *
 * Pour chaque desaccord, les deux coups sont deroules sous v3-multi avec LES MEMES
 * graines, et on mesure l'ecart apparie (coup du reseau - coup de v3) du score
 * final du joueur. Resultats par type de desaccord (joker, passe, coup ordinaire).
 *
 * Deux tables :
 *   v3  (defaut) — 4 v3-multi : positions que v3 atteint.
 *   net — le reseau et 3 v3-multi, sieges en rotation, seules les decisions du
 *         reseau sont testees : positions que le reseau atteint EN JOUANT SA partie.
 *
 * Mesure faite sur la table v3 (300 desaccords chacun) : ecart +0,04 [-0,17 ; 0,25]
 * pour le premier reseau, +0,06 [-0,16 ; 0,28] pour le reseau contrastif — les
 * choix du reseau ne sont pas pires coup par coup, alors que le premier perd
 * -7,67 points par partie en duel. La table `net` sert a separer les deux
 * explications restantes : positions que seul le reseau atteint, ou effet cumule
 * d'ecarts individuellement anodins.
 *
 * Graines de deroulement reservees : 6000000 + i * 104729 (table v3),
 * 6500000 + i * 104729 (table net). Parties : 5250000 + g * 7919 (evaluation).
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
import type { Bot } from '../bots/types'
import { gridInfo, opponentCounts, summarizeOpponents } from '../bots/valueFeatures'
import { ValueNetEvaluator, loadValueNet, makeValueNetBot } from '../bots/valueNet'
import { evaluateCandidates, mean, stderrOf } from '../analysis/evaluate'

function arg(name: string, fallback: string): string {
    const k = process.argv.indexOf(`--${name}`)
    return k !== -1 && process.argv[k + 1] ? process.argv[k + 1] : fallback
}
const GAMES = Number(arg('games', '120'))
const NET = arg('net', 'public/data/value-net.json')
const ROLLOUTS = Number(arg('rollouts', '16'))
const MAX = Number(arg('max', '300'))
const TABLE = arg('table', 'v3') as 'v3' | 'net'

const vMulti: WeightsV3 = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
const net = loadValueNet(JSON.parse(readFileSync(NET, 'utf8')))
const evaluator = new ValueNetEvaluator(net)
const v3bot = makeGreedyV3Bot(vMulti, 'v3-multi')
const SEED_BASE = TABLE === 'net' ? 6500000 : 6000000

const kind = (m: Move | null) => (m === null ? 'passe' : m.jokersSpent > 0 ? `joker x${m.jokersSpent}` : 'sans joker')
const argmax = (xs: number[]) => xs.reduce((best, v, k) => (v > xs[best] ? k : best), 0)

const byType = new Map<string, number[]>()
const all: number[] = []
let decisions = 0
const started = Date.now()

outer:
for (let g = 0; g < GAMES; g++) {
    const grid = ALL_GRIDS[g % ALL_GRIDS.length]
    const netSeat = g % 4
    const bots: Bot[] = [0, 1, 2, 3].map(k =>
        TABLE === 'net' && k === netSeat ? makeValueNetBot(net, 'reseau') : makeGreedyV3Bot(vMulti, `v3-${k}`))
    const seen: DecisionObservation[] = []
    playMultiGame(grid.cells, bots, makeRng(5250000 + g * 7919), { observe: o => seen.push(o) })
    const info = gridInfo(grid.cells)
    const stats = gridStats(grid.cells)

    for (const o of seen) {
        if (o.candidates.length < 3 || o.turn < 3) continue
        if (TABLE === 'net' && o.seat !== netSeat) continue
        decisions++
        const me = o.players[o.seat].sheet
        const others = o.players.filter((_, k) => k !== o.seat).map(p => p.sheet.mask)
        const counts = opponentCounts(others)
        const summaries = summarizeOpponents(info, others)
        const isActive = o.seat === o.turn % o.players.length
        const scorer = new V3Scorer(grid.cells, me.mask, me.jokersUsed, stats, vMulti, 8, o.turn)

        const netValues = o.candidates.map(m => {
            const s = cloneSheet(me)
            if (m) applyMove(s, m)
            return evaluator.evaluate(info, s.mask, s.jokersUsed, counts, summaries, o.turn, isActive, 8)[0]
        })
        const v3Values = o.candidates.map(m => (m ? scorer.scoreAfter(m) : scorer.value))
        const a = argmax(netValues), b = argmax(v3Values)
        if (a === b) continue

        const netMove = o.candidates[a], v3Move = o.candidates[b]
        const [vn, vv] = evaluateCandidates(
            { cells: grid.cells, players: o.players, seat: o.seat, turn: o.turn, candidates: o.candidates, played: null },
            [netMove, v3Move],
            { rollouts: ROLLOUTS, rolloutBot: v3bot, seed: SEED_BASE + all.length * 104729 },
        )
        const d = mean(vn.samples.map((s, i) => s - vv.samples[i]))
        all.push(d)
        const key = `reseau ${kind(netMove)} / v3 ${kind(v3Move)}`
        if (!byType.has(key)) byType.set(key, [])
        byType.get(key)!.push(d)
        if (all.length >= MAX) break outer
    }
}

const fmt = (xs: number[]) => {
    const m = mean(xs), se = stderrOf(xs)
    const better = xs.filter(x => x > 0).length
    return `${m >= 0 ? '+' : ''}${m.toFixed(2)} [${(m - 1.96 * se).toFixed(2)}, ${(m + 1.96 * se).toFixed(2)}]`
        + `  reseau meilleur ${(100 * better / xs.length).toFixed(0)} %  (n=${xs.length})`
}
console.log(`reseau : ${NET}, table ${TABLE}`)
console.log(`${all.length} desaccords sur ${decisions} decisions testees (${(100 * all.length / decisions).toFixed(0)} %), `
    + `${ROLLOUTS} deroulements apparies chacun, ${((Date.now() - started) / 1000).toFixed(0)} s`)
console.log(`ecart moyen (coup du reseau - coup de v3), score final : ${fmt(all)}`)
for (const [k, xs] of [...byType].sort((x, y) => y[1].length - x[1].length)) console.log(`  ${k.padEnd(34)} ${fmt(xs)}`)
