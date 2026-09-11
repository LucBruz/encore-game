/**
 * CEM sur l'heuristique v2 (21 parametres, features de frontiere).
 *
 *   corepack pnpm tune:v2
 *
 * Question posee : la FORME a 6 parametres de la v1 etait-elle limitante ?
 * Si la v2 ne gagne rien en validation hors echantillon, c'est que l'information
 * pertinente tient deja dans un resume grossier de la feuille — et alors un
 * reseau de neurones sur les memes entrees n'a pas grand-chose de plus a trouver.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { runCem } from '../bots/cem'
import { makeGreedyBot } from '../bots/basic'
import {
    DEFAULT_WEIGHTS_V2, V2_PARAM_COUNT, makeGreedyV2Bot, vecToWeightsV2, weightsV2ToVec,
} from '../bots/heuristicV2'
import { playGame } from '../bots/play'
import type { Bot } from '../bots/types'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const ITERS = Number(arg('iters', '18'))
const POP = Number(arg('pop', '28'))
const ELITE = Number(arg('elite', '7'))
const GAMES = Number(arg('games', '120'))
const TRAIN_SEED = Number(arg('seed', '515151'))
const HOLDOUT_SEED = Number(arg('holdoutSeed', '999331'))
const HOLDOUT_GAMES = Number(arg('holdoutGames', '1500'))
const OUT = arg('out', 'public/data/tuned-weights-v2.json')

function meanScore(bot: Bot, games: number, seedBase: number): number {
    let sum = 0
    for (let i = 0; i < games; i++) {
        const grid = ALL_GRIDS[i % ALL_GRIDS.length]
        sum += playGame(grid.cells, bot, makeRng(seedBase + i * 7919), { maxTurns: 50 }).score
    }
    return sum / games
}

// Bornes larges : les tables de valeur peuvent etre negatives (penaliser un etat).
const bounds: [number, number][] = [
    ...Array.from({ length: 8 }, () => [-2, 6] as [number, number]),   // columnTable
    ...Array.from({ length: 8 }, () => [-4, 10] as [number, number]),  // colorTable
    [-1, 3],   // frontier
    [-4, 8],   // colorAlive
    [0, 10],   // star
    [0, 8],    // joker
    [-1, 2],   // cell
]

if (bounds.length !== V2_PARAM_COUNT) throw new Error('bornes et parametres desynchronises')

console.log('CEM — heuristique v2 (21 parametres)')
console.log(`  iterations ${ITERS}  population ${POP}  elites ${ELITE}  parties/candidat ${GAMES}\n`)

const result = runCem(
    weightsV2ToVec(DEFAULT_WEIGHTS_V2),
    vec => meanScore(makeGreedyV2Bot(vecToWeightsV2(vec)) as Bot, GAMES, TRAIN_SEED),
    {
        iterations: ITERS, population: POP, elites: ELITE, bounds, seed: 771177,
        onIteration: ({ iter, best, eliteMean }) => {
            console.log(`  iter ${String(iter).padStart(2)} : meilleur ${best.toFixed(2)}  moy elites ${eliteMean.toFixed(2)}`)
        },
    },
)

const tunedV2 = vecToWeightsV2(result.mu)

console.log(`\nValidation sur ${HOLDOUT_GAMES} parties de graines disjointes :`)
let v1Bot: Bot | null = null
try {
    const v1 = JSON.parse(readFileSync('public/data/tuned-weights.json', 'utf8')).tuned
    v1Bot = makeGreedyBot(v1, 'greedy-cem')
} catch { /* v1 pas encore optimisee */ }

const v2Score = meanScore(makeGreedyV2Bot(tunedV2) as Bot, HOLDOUT_GAMES, HOLDOUT_SEED)
const v1Score = v1Bot ? meanScore(v1Bot, HOLDOUT_GAMES, HOLDOUT_SEED) : NaN

console.log(`  v1 optimisee  ${Number.isNaN(v1Score) ? 'n/a' : v1Score.toFixed(2)}`)
console.log(`  v2 optimisee  ${v2Score.toFixed(2)}`)
if (!Number.isNaN(v1Score)) console.log(`  ecart         ${(v2Score - v1Score).toFixed(2)}`)

console.log('\nPoids v2 :')
console.log(`  columnTable  ${tunedV2.columnTable.map(x => x.toFixed(2)).join(' ')}`)
console.log(`  colorTable   ${tunedV2.colorTable.map(x => x.toFixed(2)).join(' ')}`)
console.log(`  frontier ${tunedV2.frontier.toFixed(3)}  colorAlive ${tunedV2.colorAlive.toFixed(3)}`)
console.log(`  star ${tunedV2.star.toFixed(3)}  joker ${tunedV2.joker.toFixed(3)}  cell ${tunedV2.cell.toFixed(3)}`)

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(OUT, JSON.stringify({
    tuned: tunedV2, history: result.history,
    holdout: { games: HOLDOUT_GAMES, seed: HOLDOUT_SEED, v1: v1Score, v2: v2Score },
}, null, 2))
console.log(`\nEcrit dans ${OUT}`)
