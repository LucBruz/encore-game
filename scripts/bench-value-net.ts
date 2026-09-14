/**
 * Cout d'une decision : reseau de valeur contre heuristique v3.
 *
 *   npx tsx scripts/bench-value-net.ts --games 60
 *
 * Les deux agents sont chronometres DANS LA MEME partie, au meme siege a tour de
 * role, pour que la charge de la machine pese autant sur l'un que sur l'autre.
 */
import { readFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { makeGreedyV3Bot } from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { playMultiGame } from '../bots/playMulti'
import type { Bot } from '../bots/types'
import { loadValueNet, makeValueNetBot } from '../bots/valueNet'

const i = process.argv.indexOf('--games')
const GAMES = i !== -1 ? Number(process.argv[i + 1]) : 60

const vMulti: WeightsV3 = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
const net = loadValueNet(JSON.parse(readFileSync('public/data/value-net.json', 'utf8')))

interface Timed { bot: Bot; ms: number; decisions: number; candidates: number }
const timed = (bot: Bot): Timed => {
    const t: Timed = { bot, ms: 0, decisions: 0, candidates: 0 }
    t.bot = {
        name: bot.name,
        chooseMove(ctx) {
            const s = performance.now()
            const m = bot.chooseMove(ctx)
            t.ms += performance.now() - s
            if (ctx.moves.length) { t.decisions++; t.candidates += ctx.moves.length + 1 }
            return m
        },
    }
    return t
}

const v3 = timed(makeGreedyV3Bot(vMulti, 'v3-multi'))
const vn = timed(makeValueNetBot(net, 'reseau-score'))

for (let g = 0; g < GAMES; g++) {
    const table = g % 2 === 0 ? [v3.bot, vn.bot, v3.bot, vn.bot] : [vn.bot, v3.bot, vn.bot, v3.bot]
    playMultiGame(ALL_GRIDS[g % ALL_GRIDS.length].cells, table, makeRng(9_000_000 + g * 7919))
}

for (const t of [v3, vn]) {
    console.log(
        `${t.bot.name.padEnd(14)} ${(t.ms / t.decisions).toFixed(3)} ms/decision, `
        + `${(t.ms / t.candidates * 1000).toFixed(1)} µs/candidat, ${(t.candidates / t.decisions).toFixed(1)} candidats/decision`,
    )
}
