/**
 * CEM sur l'heuristique v3 (13 parametres : forme + timing).
 *
 *   corepack pnpm tune:v3
 *
 * Les features viennent d'un joueur, pas d'une intuition d'implementeur :
 * eviter de laisser des cases isolees, ouvrir des possibilites tot, finir tot les
 * colonnes extremes, garder ses jokers, jouer les couleurs tard.
 *
 * Validation sur un jeu de graines DISJOINT de celui d'optimisation, et comparaison
 * appariee contre la v1 optimisee sur ces memes graines.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { runCem } from '../bots/cem'
import { makeGreedyBot } from '../bots/baselines/basic'
import {
    DEFAULT_WEIGHTS_V3, V3_KEYS, makeGreedyV3Bot, vecToWeightsV3, weightsV3ToVec,
} from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { playGame } from '../bots/play'
import type { Bot } from '../bots/types'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const ITERS = Number(arg('iters', '20'))
const POP = Number(arg('pop', '28'))
const ELITE = Number(arg('elite', '7'))
const GAMES = Number(arg('games', '150'))
const TRAIN_SEED = Number(arg('seed', '606060'))
const HOLDOUT_SEED = Number(arg('holdoutSeed', '999331'))
const HOLDOUT_GAMES = Number(arg('holdoutGames', '2000'))
const OUT = arg('out', 'public/data/tuned-weights-v3.json')
/**
 * Horizon de partie. Le defaut n'est PAS un detail : a 50 tours l'optimiseur
 * apprend a temporiser (thesauriser les jokers, passer souvent), ce qui ne coute
 * rien en solitaire mais se fait punir en vraie partie, ou c'est l'adversaire qui
 * decide de la fin. Une partie reelle se termine vers le tour 41.
 */
const MAX_TURNS = Number(arg('maxTurns', '40'))

// Bornes par parametre, dans l'ordre de V3_KEYS.
const BOUNDS: Record<keyof WeightsV3, [number, number]> = {
    columnExponent: [0.5, 6],
    extremeColumnEarly: [0, 12],
    colorExponent: [0.2, 4],
    colorValueEarly: [0, 8],
    colorValueLate: [0, 14],
    orphan1: [0, 8],
    orphan2: [0, 5],
    frontierEarly: [0, 3],
    jokerValue: [0, 10],
    starValue: [0, 8],
    cellValue: [0, 2],
    earlyHorizon: [1, 30],
    lateHorizon: [1, 45],
}

const bounds = V3_KEYS.map(k => BOUNDS[k])

function meanScore(bot: Bot, games: number, seedBase: number): number {
    let sum = 0
    for (let i = 0; i < games; i++) {
        const grid = ALL_GRIDS[i % ALL_GRIDS.length]
        sum += playGame(grid.cells, bot, makeRng(seedBase + i * 7919), { maxTurns: MAX_TURNS }).score
    }
    return sum / games
}

/** Ecart apparie et son incertitude, sur les memes graines. */
function pairedDelta(a: Bot, b: Bot, games: number, seedBase: number) {
    const diffs: number[] = []
    for (let i = 0; i < games; i++) {
        const grid = ALL_GRIDS[i % ALL_GRIDS.length]
        const sa = playGame(grid.cells, a, makeRng(seedBase + i * 7919), { maxTurns: MAX_TURNS }).score
        const sb = playGame(grid.cells, b, makeRng(seedBase + i * 7919), { maxTurns: MAX_TURNS }).score
        diffs.push(sa - sb)
    }
    const m = diffs.reduce((x, y) => x + y, 0) / diffs.length
    const sd = Math.sqrt(diffs.reduce((x, y) => x + (y - m) ** 2, 0) / diffs.length)
    const se = sd / Math.sqrt(diffs.length)
    return { delta: m, stderr: se, ci95: [m - 1.96 * se, m + 1.96 * se] as [number, number] }
}

console.log('CEM — heuristique v3 (forme + timing, 13 parametres)')
console.log(`  iterations ${ITERS}  population ${POP}  elites ${ELITE}  parties/candidat ${GAMES}  maxTurns ${MAX_TURNS}`)
const base = meanScore(makeGreedyV3Bot(DEFAULT_WEIGHTS_V3), GAMES, TRAIN_SEED)
console.log(`  depart (poids a la main) : ${base.toFixed(2)}\n`)

const result = runCem(
    weightsV3ToVec(DEFAULT_WEIGHTS_V3),
    vec => meanScore(makeGreedyV3Bot(vecToWeightsV3(vec)), GAMES, TRAIN_SEED),
    {
        iterations: ITERS, population: POP, elites: ELITE, bounds, seed: 313131,
        onIteration: ({ iter, best, eliteMean }) => {
            console.log(`  iter ${String(iter).padStart(2)} : meilleur ${best.toFixed(2)}  moy elites ${eliteMean.toFixed(2)}`)
        },
    },
)

const tuned = vecToWeightsV3(result.mu)

console.log('\nPoids v3 :')
for (const k of V3_KEYS) {
    console.log(`  ${String(k).padEnd(20)} ${String(DEFAULT_WEIGHTS_V3[k]).padStart(7)}  ->  ${tuned[k].toFixed(3)}`)
}

const v1Weights = JSON.parse(readFileSync('public/data/tuned-weights.json', 'utf8')).tuned
const v1Bot = makeGreedyBot(v1Weights, 'greedy-cem')
const v3Bot = makeGreedyV3Bot(tuned)

console.log(`\nValidation appariee sur ${HOLDOUT_GAMES} parties de graines disjointes :`)
const v1 = meanScore(v1Bot, HOLDOUT_GAMES, HOLDOUT_SEED)
const v3 = meanScore(v3Bot, HOLDOUT_GAMES, HOLDOUT_SEED)
const paired = pairedDelta(v3Bot, v1Bot, HOLDOUT_GAMES, HOLDOUT_SEED)
const significant = Math.abs(paired.delta) > 1.96 * paired.stderr

console.log(`  greedy-cem (v1)  ${v1.toFixed(2)}`)
console.log(`  greedy-v3        ${v3.toFixed(2)}`)
console.log(
    `  ecart apparie    ${paired.delta >= 0 ? '+' : ''}${paired.delta.toFixed(2)} `
    + `[${paired.ci95[0].toFixed(2)}, ${paired.ci95[1].toFixed(2)}]`
    + `${significant ? '' : '   NON SIGNIFICATIF'}`,
)

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(OUT, JSON.stringify({
    tuned, default: DEFAULT_WEIGHTS_V3, history: result.history,
    holdout: { games: HOLDOUT_GAMES, seed: HOLDOUT_SEED, v1, v3, paired, significant },
}, null, 2))
console.log(`\nEcrit dans ${OUT}`)
