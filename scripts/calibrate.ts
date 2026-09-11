/**
 * Calibration des niveaux de difficulte, MESUREE EN PARTIE A 4 JOUEURS.
 *
 *   corepack pnpm calibrate
 *   corepack pnpm calibrate -- --targets 30,55 --games 400
 *
 * Le principe : UNE politique, un seul bouton. La temperature du softmax degrade
 * la meilleure politique de facon continue, et chaque niveau est ensuite calibre
 * par dichotomie sur un TAUX DE VICTOIRE cible.
 *
 * Pourquoi un taux de victoire et non un score : a une table de 4, un score
 * absolu depend autant des adversaires que de l'agent. Ce que ressent un joueur
 * humain, c'est sa frequence de victoire contre le bot.
 *
 * Pourquoi en multijoueur : la calibration solitaire heritait du meme biais que
 * l'optimisation solitaire — elle ne punissait pas la temporisation, et notait
 * donc mal les politiques degradees qui passent souvent.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { makeTemperedBot } from '../bots/difficulty'
import { makeV3MoveScorer } from '../bots/scorers'
import { makeGreedyV3Bot } from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { playMultiGame } from '../bots/playMulti'
import type { Bot } from '../bots/types'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const GAMES = Number(arg('games', '400'))
const SEED = Number(arg('seed', '818181'))
/** Taux de victoire vises pour easy et medium, en %. La reference joue a 100 % d'elle-meme. */
const TARGETS = arg('targets', '8,25').split(',').map(Number)
const MAX_TURNS = Number(arg('maxTurns', '60'))
const OUT = arg('out', 'public/data/difficulty.json')

const W: WeightsV3 = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
const scorer = makeV3MoveScorer(W)

/** Le niveau teste affronte trois exemplaires du niveau maximal. */
const reference = makeGreedyV3Bot(W, 'v3-multi')

interface Measure { winRate: number; meanScore: number; stdev: number; passes: number }

function measure(temperature: number, games: number): Measure {
    const bot: Bot = temperature <= 0 ? reference : makeTemperedBot(scorer, temperature, `T${temperature}`)
    let wins = 0, passes = 0
    const scores: number[] = []

    for (let g = 0; g < games; g++) {
        const grid = ALL_GRIDS[g % ALL_GRIDS.length]
        const seat = g % 4
        const table: Bot[] = Array.from({ length: 4 }, (_, s) => (s === seat ? bot : reference))
        const r = playMultiGame(grid.cells, table, makeRng(SEED + g * 7919), { maxTurns: MAX_TURNS })
        scores.push(r.scores[seat])
        passes += r.passes[seat]
        if (r.winnerIndex === seat) wins++
    }

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length
    const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length)
    return { winRate: 100 * wins / games, meanScore: mean, stdev: sd, passes: passes / games }
}

/** Le taux de victoire decroit avec la temperature : une dichotomie suffit. */
function temperatureFor(targetWinRate: number): { temperature: number } & Measure {
    let lo = 0, hi = 6
    let mid = hi
    for (let step = 0; step < 11; step++) {
        mid = (lo + hi) / 2
        const r = measure(mid, Math.min(GAMES, 200))
        if (r.winRate > targetWinRate) lo = mid
        else hi = mid
    }
    return { temperature: mid, ...measure(mid, GAMES) }
}

console.log('Calibration des niveaux — mesuree en partie a 4 joueurs')
console.log(`  le niveau teste affronte 3 exemplaires du niveau maximal`)
console.log(`  ${GAMES} parties par mesure, graine ${SEED}\n`)

const hard = measure(0, GAMES)
console.log(`  hard    T = 0.000   victoires ${hard.winRate.toFixed(1)} %   score ${hard.meanScore.toFixed(2)}   passes ${hard.passes.toFixed(2)}`)

const levels = [{ id: 'hard', temperature: 0, ...hard }]
for (const target of TARGETS) {
    const r = temperatureFor(target)
    const id = target === Math.max(...TARGETS) ? 'medium' : 'easy'
    console.log(
        `  ${id.padEnd(7)} T = ${r.temperature.toFixed(3)}   victoires ${r.winRate.toFixed(1)} %`
        + `   score ${r.meanScore.toFixed(2)}   passes ${r.passes.toFixed(2)}   (cible ${target} %)`,
    )
    levels.push({ id, temperature: r.temperature, ...r })
}

levels.sort((a, b) => a.winRate - b.winRate)
console.log('\nEchelle obtenue (taux de victoire contre 3 bots au maximum) :')
for (const l of levels) console.log(`  ${l.id.padEnd(7)} ${l.winRate.toFixed(1)} %   score ${l.meanScore.toFixed(1)}`)

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(OUT, JSON.stringify({
    policy: 'v3-multi', games: GAMES, seed: SEED, mode: '4 joueurs, adversaires au niveau maximal', levels,
}, null, 2))
console.log(`\nEcrit dans ${OUT}`)
