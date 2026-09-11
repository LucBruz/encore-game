/**
 * CEM dont la fitness est mesuree en PARTIE REELLE A 4 JOUEURS.
 *
 *   corepack pnpm tune:multi
 *   corepack pnpm tune:multi -- --iters 16 --pop 24 --games 60
 *
 * Pourquoi ce script remplace l'optimisation solitaire : mesure faite, l'agent le
 * mieux note en solitaire arrive DERNIER a une table de 4 (18,73 contre 26,40 pour
 * le meme agent prive du droit de passer). Le solitaire ne punit pas la
 * temporisation, puisque l'agent y decide seul de la fin. Trois choses n'existent
 * qu'ici :
 *
 *   - le deni de des : les joueurs passifs n'ont que les 4 des restants
 *   - la fin decidee par autrui : le premier a completer 2 couleurs coupe tout le monde
 *   - les bonus premier / suivants, qui recompensent la vitesse
 *
 * Le passe volontaire reste AUTORISE au candidat : c'est a l'optimiseur de decider
 * s'il vaut quelque chose une fois que temporiser coute vraiment.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { gridStats } from '../engine/scoring'
import { runCem } from '../bots/cem'
import { makeGreedyBot } from '../bots/baselines/basic'
import {
    DEFAULT_WEIGHTS_V3, V3Scorer, V3_KEYS, makeGreedyV3Bot, vecToWeightsV3, weightsV3ToVec,
} from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { playMultiGame } from '../bots/playMulti'
import type { Bot, TurnContext } from '../bots/types'
import type { Cells } from '../engine/types'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const ITERS = Number(arg('iters', '16'))
const POP = Number(arg('pop', '24'))
const ELITE = Number(arg('elite', '6'))
const GAMES = Number(arg('games', '64'))
const TRAIN_SEED = Number(arg('seed', '707070'))
const HOLDOUT_SEED = Number(arg('holdoutSeed', '246813'))
const HOLDOUT_GAMES = Number(arg('holdoutGames', '1200'))
const MAX_TURNS = Number(arg('maxTurns', '60'))
const OUT = arg('out', 'public/data/tuned-weights-multi.json')

const load = (p: string) => JSON.parse(readFileSync(p, 'utf8')).tuned
const v3h50: WeightsV3 = load('public/data/tuned-weights-v3-h50.json')
const v1 = load('public/data/tuned-weights.json')

/** Meme evaluation, passe volontaire interdit. */
function makeV3NoPass(w: WeightsV3, name: string): Bot {
    const cache = new WeakMap<object, any>()
    const statsFor = (cells: Cells) => {
        const k = cells as unknown as object
        let s = cache.get(k); if (!s) { s = gridStats(cells); cache.set(k, s) }
        return s
    }
    return {
        name,
        chooseMove({ cells, sheet, moves, totalJokers, turn }: TurnContext) {
            if (moves.length === 0) return null
            const sc = new V3Scorer(cells, sheet.mask, sheet.jokersUsed, statsFor(cells), w, totalJokers, turn)
            let best = moves[0], bestV = -Infinity
            for (const m of moves) { const v = sc.scoreAfter(m); if (v > bestV) { bestV = v; best = m } }
            return best
        },
    }
}

/**
 * Panel d'adversaires volontairement heterogene : s'entrainer contre un seul style
 * apprendrait a battre ce style, pas a jouer.
 */
const OPPONENTS: Bot[] = [
    makeV3NoPass(v3h50, 'v3-sans-passe'),
    makeGreedyBot(v1, 'greedy-cem'),
    makeGreedyV3Bot({ ...v3h50, jokerValue: 1.5 }, 'v3-joker-1.5'),
]

interface Fitness { meanScore: number; winRate: number; meanMargin: number }

/** Le candidat occupe chaque siege a tour de role, contre le meme panel. */
function evaluateCandidate(w: WeightsV3, games: number, seedBase: number): Fitness {
    const candidate = makeGreedyV3Bot(w, 'candidat')
    let sum = 0, wins = 0, margin = 0

    for (let g = 0; g < games; g++) {
        const grid = ALL_GRIDS[g % ALL_GRIDS.length]
        const seat = g % 4
        const table: Bot[] = []
        let o = 0
        for (let s = 0; s < 4; s++) table.push(s === seat ? candidate : OPPONENTS[o++ % OPPONENTS.length])

        const r = playMultiGame(grid.cells, table, makeRng(seedBase + g * 7919), { maxTurns: MAX_TURNS })
        sum += r.scores[seat]
        if (r.winnerIndex === seat) wins++
        const others = r.scores.filter((_, i) => i !== seat)
        margin += r.scores[seat] - Math.max(...others)
    }

    return { meanScore: sum / games, winRate: wins / games, meanMargin: margin / games }
}

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

console.log('CEM — fitness mesuree en partie a 4 joueurs (vraie regle)')
console.log(`  iterations ${ITERS}  population ${POP}  elites ${ELITE}  parties/candidat ${GAMES}`)
console.log(`  adversaires : ${OPPONENTS.map(o => o.name).join(', ')}\n`)

const start = evaluateCandidate(v3h50, GAMES, TRAIN_SEED)
console.log(`  depart (poids solo h50) : score ${start.meanScore.toFixed(2)}  victoires ${(100 * start.winRate).toFixed(1)} %\n`)

// La marge contre le meilleur adversaire est la cible : elle mesure la
// competitivite et non le niveau absolu de la table.
const result = runCem(
    weightsV3ToVec(v3h50),
    vec => evaluateCandidate(vecToWeightsV3(vec), GAMES, TRAIN_SEED).meanMargin,
    {
        iterations: ITERS, population: POP, elites: ELITE, bounds, seed: 987654,
        onIteration: ({ iter, best, eliteMean }) => {
            console.log(`  iter ${String(iter).padStart(2)} : marge ${best.toFixed(2)}  moy elites ${eliteMean.toFixed(2)}`)
        },
    },
)

const tuned = vecToWeightsV3(result.mu)

console.log('\nPoids (solo h50 -> multijoueur) :')
for (const k of V3_KEYS) {
    console.log(`  ${String(k).padEnd(20)} ${v3h50[k].toFixed(3).padStart(8)}  ->  ${tuned[k].toFixed(3)}`)
}

console.log(`\nValidation sur ${HOLDOUT_GAMES} parties de graines disjointes :`)
for (const [label, w] of [['solo h50', v3h50], ['multijoueur', tuned]] as [string, WeightsV3][]) {
    const f = evaluateCandidate(w, HOLDOUT_GAMES, HOLDOUT_SEED)
    console.log(
        `  ${label.padEnd(12)} score ${f.meanScore.toFixed(2)}`
        + `  victoires ${(100 * f.winRate).toFixed(1)} %`
        + `  marge ${f.meanMargin >= 0 ? '+' : ''}${f.meanMargin.toFixed(2)}`,
    )
}

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(OUT, JSON.stringify({
    tuned, from: v3h50, history: result.history,
    opponents: OPPONENTS.map(o => o.name), games: GAMES, maxTurns: MAX_TURNS,
}, null, 2))
console.log(`\nEcrit dans ${OUT}`)
