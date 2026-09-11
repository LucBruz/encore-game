/**
 * Harnais d'evaluation : distributions de scores par agent, graine fixee.
 *
 *   corepack pnpm eval
 *   corepack pnpm eval -- --games 2000 --mode first
 *   corepack pnpm eval -- --only greedy-cem,mc-cem --baseline greedy-cem --games 48
 *
 * Deux precautions rendent les chiffres exploitables :
 *
 * 1. COMPARAISON APPARIEE — a index de partie egal, tous les agents recoivent la
 *    meme graine, donc la meme suite de des sur la meme grille. Le bruit des des
 *    est commun et s'annule dans les ecarts.
 * 2. INCERTITUDE DE L'ECART — une difference de moyennes ne veut rien dire sans
 *    savoir combien elle fluctue. On reporte l'ecart apparie, son erreur standard
 *    et un intervalle a 95 %, pour distinguer un vrai gain du bruit.
 *
 * Le mode de bonus est toujours imprime : en mono-agent il n'y a pas d'adversaire,
 * donc "first"/"others" est un choix, et les scores ne se comparent qu'a mode egal.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import type { BonusMode } from '../engine/scoring'
import { greedyBot, makeGreedyBot, randomBot } from '../bots/baselines/basic'
import { makeExpectimaxBot } from '../bots/baselines/expectimax'
import { makeMonteCarloBot } from '../bots/baselines/montecarlo'
import { DEFAULT_WEIGHTS_V2, makeGreedyV2Bot } from '../bots/baselines/heuristicV2'
import { DEFAULT_WEIGHTS_V3, makeGreedyV3Bot } from '../bots/heuristicV3'
import { playGame } from '../bots/play'
import type { Bot } from '../bots/types'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const GAMES = Number(arg('games', '2000'))
const MODE = arg('mode', 'average') as BonusMode
const SEED = Number(arg('seed', '20260911'))
const MAX_TURNS = Number(arg('maxTurns', '50'))
const ONLY = arg('only', '')
const BASELINE = arg('baseline', 'greedy-cem')
const OUT = arg('out', 'public/data/eval.json')

// ─── Agents ───────────────────────────────────────────────────────────────────

function loadTuned(path: string): Record<string, any> | null {
    try { return JSON.parse(readFileSync(path, 'utf8')).tuned } catch { return null }
}

const tunedV1 = loadTuned('public/data/tuned-weights.json')
const tunedV2 = loadTuned('public/data/tuned-weights-v2.json')
const tunedV3 = loadTuned('public/data/tuned-weights-v3.json')

const ALL_BOTS: Bot[] = [randomBot, greedyBot]
if (tunedV1) {
    ALL_BOTS.push(makeGreedyBot(tunedV1 as any, 'greedy-cem'))
    ALL_BOTS.push(makeExpectimaxBot({ weights: tunedV1 as any, depth: 2, topK: 8, rollSamples: 20, name: 'expectimax' }))
    ALL_BOTS.push(makeMonteCarloBot({ weights: tunedV1 as any, topK: 8, rollouts: 24, name: 'mc-cem' }))
}
ALL_BOTS.push(makeGreedyV2Bot((tunedV2 as any) ?? DEFAULT_WEIGHTS_V2, 'greedy-v2'))
ALL_BOTS.push(makeGreedyV3Bot((tunedV3 as any) ?? DEFAULT_WEIGHTS_V3, 'greedy-v3'))

// Les agents a deroulements coutent plusieurs secondes par partie : hors du jeu
// par defaut, on ne les sort que pour une sonde ciblee via --only.
const DEFAULT_SET = ['random', 'greedy', 'greedy-cem', 'greedy-v2', 'greedy-v3']
const bots = ONLY
    ? ALL_BOTS.filter(b => ONLY.split(',').includes(b.name))
    : ALL_BOTS.filter(b => DEFAULT_SET.includes(b.name))

if (bots.length === 0) {
    console.error(`Aucun agent ne correspond a --only "${ONLY}". Disponibles : ${ALL_BOTS.map(b => b.name).join(', ')}`)
    process.exit(1)
}

// ─── Mesure ───────────────────────────────────────────────────────────────────

interface Run {
    bot: string
    scores: number[]
    turns: number[]
    passes: number[]
    natural: number
    ms: number
}

function runBot(bot: Bot): Run {
    const scores: number[] = []
    const turns: number[] = []
    const passes: number[] = []
    let natural = 0
    const t0 = performance.now()

    for (let i = 0; i < GAMES; i++) {
        const grid = ALL_GRIDS[i % ALL_GRIDS.length]
        const r = playGame(grid.cells, bot, makeRng(SEED + i * 7919), { maxTurns: MAX_TURNS, mode: MODE })
        scores.push(r.score)
        turns.push(r.turns)
        passes.push(r.passes)
        if (r.endedNaturally) natural++
    }

    return { bot: bot.name, scores, turns, passes, natural, ms: performance.now() - t0 }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const stdev = (xs: number[]) => {
    const m = mean(xs)
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

function summarise(run: Run) {
    const sorted = [...run.scores].sort((a, b) => a - b)
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]

    const binSize = 5
    const bins = new Map<number, number>()
    for (const s of run.scores) {
        const bin = Math.floor(s / binSize) * binSize
        bins.set(bin, (bins.get(bin) ?? 0) + 1)
    }

    return {
        bot: run.bot,
        games: run.scores.length,
        mean: +mean(run.scores).toFixed(2),
        median: q(0.5),
        stdev: +stdev(run.scores).toFixed(2),
        p10: q(0.1),
        p90: q(0.9),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        meanTurns: +mean(run.turns).toFixed(1),
        naturalEndRate: +(run.natural / run.scores.length).toFixed(3),
        meanPasses: +mean(run.passes).toFixed(2),
        histogram: [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([bin, count]) => ({ bin, count })),
        msPerGame: +(run.ms / run.scores.length).toFixed(3),
    }
}

/** Ecart apparie contre la reference, avec son incertitude. */
function pairedAgainst(run: Run, base: Run | undefined) {
    if (!base || base.bot === run.bot) return null
    const diffs = run.scores.map((s, i) => s - base.scores[i])
    const d = mean(diffs)
    const se = stdev(diffs) / Math.sqrt(diffs.length)
    return {
        vs: base.bot,
        delta: +d.toFixed(2),
        stderr: +se.toFixed(3),
        ci95: [+(d - 1.96 * se).toFixed(2), +(d + 1.96 * se).toFixed(2)] as [number, number],
        // Un intervalle qui contient 0 ne se distingue pas du bruit.
        significant: Math.abs(d) > 1.96 * se,
    }
}

// ─── Sortie ───────────────────────────────────────────────────────────────────

console.log('Encore! — evaluation mono-agent')
console.log(`  parties/agent : ${GAMES}   mode bonus : ${MODE}   graine : ${SEED}   maxTurns : ${MAX_TURNS}`)
console.log(`  grilles : les ${ALL_GRIDS.length} officielles, en rotation`)
console.log(`  ecarts apparies contre : ${BASELINE}\n`)

const runs = bots.map(runBot)
const base = runs.find(r => r.bot === BASELINE)
const results = runs.map(r => ({ ...summarise(r), paired: pairedAgainst(r, base) }))

const pad = (s: string | number, n: number) => String(s).padStart(n)
console.log(
    `${'agent'.padEnd(11)} ${pad('moy', 7)} ${pad('med', 5)} ${pad('ecart', 6)} ${pad('p10', 5)} ${pad('p90', 5)} `
    + `${pad('tours', 6)} ${pad('fin2c', 6)} ${pad('pass', 5)} ${pad('ms/j', 9)}   ecart apparie`,
)
for (const r of results) {
    const p = r.paired
    const txt = p
        ? `${p.delta >= 0 ? '+' : ''}${p.delta.toFixed(2)} [${p.ci95[0]}, ${p.ci95[1]}]${p.significant ? '' : '  non significatif'}`
        : '(reference)'
    console.log(
        `${r.bot.padEnd(11)} ${pad(r.mean, 7)} ${pad(r.median, 5)} ${pad(r.stdev, 6)} ${pad(r.p10, 5)} ${pad(r.p90, 5)} `
        + `${pad(r.meanTurns, 6)} ${pad(r.naturalEndRate, 6)} ${pad(r.meanPasses, 5)} ${pad(r.msPerGame, 9)}   ${txt}`,
    )
}

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(OUT, JSON.stringify({
    mode: MODE, games: GAMES, seed: SEED, maxTurns: MAX_TURNS, baseline: BASELINE, results,
}, null, 2))
console.log(`\nEcrit dans ${OUT}`)
