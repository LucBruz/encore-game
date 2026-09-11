/**
 * Optimisation des poids de l'heuristique par methode d'entropie croisee (CEM).
 *
 *   corepack pnpm tune
 *   corepack pnpm tune -- --iters 20 --pop 32 --games 150
 *
 * Pourquoi : cela mesure si la FORME de l'evaluation a encore de la marge. Si des
 * poids optimises ne font pas bouger le score, le glouton est proche du plafond de
 * cette famille de fonctions, et un modele appris n'aura pas grand-chose a demontrer.
 *
 * Les poids sont ajustes sur un jeu de graines, et le resultat final est reporte sur
 * un jeu de graines DISJOINT, sinon on mesure du surapprentissage.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { makeGreedyBot } from '../bots/baselines/basic'
import { DEFAULT_WEIGHTS } from '../bots/baselines/heuristic'
import type { HeuristicWeights } from '../bots/baselines/heuristic'
import { playGame } from '../bots/play'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const ITERS = Number(arg('iters', '15'))
const POP = Number(arg('pop', '24'))
const ELITE = Number(arg('elite', '6'))
const GAMES = Number(arg('games', '150'))
const TRAIN_SEED = Number(arg('seed', '424242'))
const HOLDOUT_SEED = Number(arg('holdoutSeed', '999331'))
const HOLDOUT_GAMES = Number(arg('holdoutGames', '1500'))
const OUT = arg('out', 'public/data/tuned-weights.json')

const KEYS: (keyof HeuristicWeights)[] = [
    'columnExponent', 'colorExponent', 'colorValue', 'starValue', 'jokerValue', 'cellValue',
]

// Bornes : evitent les exposants absurdes et gardent l'evaluation interpretable.
const BOUNDS: Record<keyof HeuristicWeights, [number, number]> = {
    columnExponent: [0.5, 6],
    colorExponent: [0.5, 6],
    colorValue: [0, 20],
    starValue: [0, 10],
    jokerValue: [0, 6],
    cellValue: [0, 2],
}

type Vec = number[]

const toVec = (w: HeuristicWeights): Vec => KEYS.map(k => w[k])
const toWeights = (v: Vec): HeuristicWeights => {
    const w = {} as HeuristicWeights
    KEYS.forEach((k, i) => {
        const [lo, hi] = BOUNDS[k]
        w[k] = Math.min(hi, Math.max(lo, v[i]))
    })
    return w
}

/** Score moyen sur un lot de parties fixe. Memes graines pour tous les candidats. */
function meanScore(w: HeuristicWeights, games: number, seedBase: number): number {
    const bot = makeGreedyBot(w)
    let sum = 0
    for (let i = 0; i < games; i++) {
        const grid = ALL_GRIDS[i % ALL_GRIDS.length]
        const r = playGame(grid.cells, bot, makeRng(seedBase + i * 7919), { maxTurns: 50 })
        sum += r.score
    }
    return sum / games
}

// Box-Muller pour echantillonner la gaussienne de la CEM.
function gaussian(rng: () => number): number {
    let u = 0, v = 0
    while (u === 0) u = rng()
    while (v === 0) v = rng()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const rng = makeRng(20260911)

let mu = toVec(DEFAULT_WEIGHTS)
let sigma = KEYS.map(k => (BOUNDS[k][1] - BOUNDS[k][0]) / 4)

console.log('CEM — optimisation des poids de l heuristique')
console.log(`  iterations ${ITERS}  population ${POP}  elites ${ELITE}  parties/candidat ${GAMES}`)
const baseline = meanScore(DEFAULT_WEIGHTS, GAMES, TRAIN_SEED)
console.log(`  base (poids par defaut) sur le lot d entrainement : ${baseline.toFixed(2)}\n`)

const history: { iter: number; best: number; eliteMean: number }[] = []

for (let iter = 0; iter < ITERS; iter++) {
    const candidates: { vec: Vec; score: number }[] = []

    for (let p = 0; p < POP; p++) {
        const vec = mu.map((m, i) => m + sigma[i] * gaussian(rng))
        const w = toWeights(vec)
        candidates.push({ vec: toVec(w), score: meanScore(w, GAMES, TRAIN_SEED) })
    }

    candidates.sort((a, b) => b.score - a.score)
    const elites = candidates.slice(0, ELITE)

    mu = KEYS.map((_, i) => elites.reduce((s, e) => s + e.vec[i], 0) / elites.length)
    sigma = KEYS.map((_, i) => {
        const variance = elites.reduce((s, e) => s + (e.vec[i] - mu[i]) ** 2, 0) / elites.length
        // Plancher de bruit : empeche l'effondrement premature de la distribution.
        return Math.max(Math.sqrt(variance), (BOUNDS[KEYS[i]][1] - BOUNDS[KEYS[i]][0]) * 0.02)
    })

    const eliteMean = elites.reduce((s, e) => s + e.score, 0) / elites.length
    history.push({ iter, best: +candidates[0].score.toFixed(2), eliteMean: +eliteMean.toFixed(2) })
    console.log(`  iter ${String(iter).padStart(2)} : meilleur ${candidates[0].score.toFixed(2)}  moy elites ${eliteMean.toFixed(2)}`)
}

const tuned = toWeights(mu)

console.log('\nPoids obtenus :')
for (const k of KEYS) console.log(`  ${k.padEnd(16)} ${DEFAULT_WEIGHTS[k]}  ->  ${tuned[k].toFixed(3)}`)

console.log(`\nValidation sur ${HOLDOUT_GAMES} parties de graines disjointes :`)
const holdoutBase = meanScore(DEFAULT_WEIGHTS, HOLDOUT_GAMES, HOLDOUT_SEED)
const holdoutTuned = meanScore(tuned, HOLDOUT_GAMES, HOLDOUT_SEED)
console.log(`  defaut ${holdoutBase.toFixed(2)}   optimise ${holdoutTuned.toFixed(2)}   ecart ${(holdoutTuned - holdoutBase).toFixed(2)}`)

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(OUT, JSON.stringify({
    tuned, default: DEFAULT_WEIGHTS, history,
    holdout: { games: HOLDOUT_GAMES, seed: HOLDOUT_SEED, base: holdoutBase, tuned: holdoutTuned },
}, null, 2))
console.log(`\nEcrit dans ${OUT}`)
