/**
 * Temps par decision du bot a recherche, en vraie partie contre v3-multi.
 *
 *   npx tsx scripts/bench-search.ts --net public/data/value-net-mix.json --seats 2 --games 3
 *
 * Budget fixe par le jeu : moins de 3 s par coup. On mesure la moyenne ET le pire
 * cas, car c'est le pire coup que le joueur attend.
 */
import { readFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { makeGreedyV3Bot } from '../bots/heuristicV3'
import { playMultiGame } from '../bots/playMulti'
import { makeSearchBot } from '../bots/search'
import type { Bot } from '../bots/types'
import { loadValueNet } from '../bots/valueNet'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const NET = arg('net', 'public/data/value-net-mix.json')
const SEATS = Number(arg('seats', '2'))
const GAMES = Number(arg('games', '3'))
const CONFIGS = arg('configs', '4:16:4,6:16:4,4:32:6').split(',').map(c => c.split(':').map(Number))

const net = loadValueNet(JSON.parse(readFileSync(NET, 'utf8')))
const v3 = makeGreedyV3Bot(JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned, 'v3-multi')

for (const [topK, rollouts, horizon] of CONFIGS) {
    const search = makeSearchBot(net, { topK, rollouts, horizon, opponentBot: v3 })
    const times: number[] = []
    const timed: Bot = {
        name: search.name,
        chooseMove(ctx) {
            const t = performance.now()
            const m = search.chooseMove(ctx)
            times.push(performance.now() - t)
            return m
        },
    }
    for (let g = 0; g < GAMES; g++) {
        const bots = Array.from({ length: SEATS }, (_, s) => (s === g % SEATS ? timed : v3))
        playMultiGame(ALL_GRIDS[g % ALL_GRIDS.length].cells, bots, makeRng(8_800_000 + g * 7919))
    }
    times.sort((a, b) => a - b)
    const mean = times.reduce((a, b) => a + b, 0) / times.length
    console.log(
        `k${topK} r${rollouts} h${horizon} (${SEATS} joueurs) : ${times.length} decisions, `
        + `moyenne ${mean.toFixed(0)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(0)} ms, `
        + `max ${times[times.length - 1].toFixed(0)} ms`,
    )
}
