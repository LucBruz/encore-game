/**
 * L'analyse distingue-t-elle un bon joueur d'un mauvais ?
 *
 *   corepack pnpm analyse:bands
 *   corepack pnpm analyse:bands -- --decisions 20 --rollouts 32 --horizon 3
 *
 * C'est le test qui decide si la review vaut quelque chose. On fait jouer, a la
 * meme table, quatre niveaux dont on connait la force par construction :
 * la politique v3 au maximum, deux versions degradees par temperature, et un
 * joueur qui choisit au hasard parmi les coups legaux.
 *
 * Si l'ecart moyen impute par l'analyse ne croit pas quand le joueur faiblit,
 * l'analyse ne mesure rien. Si il croit, la distribution des ecarts donne en
 * meme temps les seuils des verdicts — mesures, et non choisis.
 */
import { readFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { makeGreedyV3Bot } from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { makeV3MoveScorer } from '../bots/scorers'
import { makeTemperedBot } from '../bots/difficulty'
import { randomBot } from '../bots/baselines/basic'
import { playMultiGame } from '../bots/playMulti'
import type { DecisionObservation } from '../bots/playMulti'
import { analyseDecision } from '../analysis/verdict'
import type { Verdict } from '../analysis/verdict'
import type { Bot } from '../bots/types'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const PER_SEAT = Number(arg('decisions', '20'))
const ROLLOUTS = Number(arg('rollouts', '32'))
const SCREEN = Number(arg('screen', '8'))
const SHORTLIST = Number(arg('shortlist', '8'))
const HORIZON = Number(arg('horizon', '3'))
const SEED = Number(arg('seed', '515151'))

const W: WeightsV3 = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
const scorer = makeV3MoveScorer(W)
const policy = makeGreedyV3Bot(W, 'v3-multi')

// Temperatures issues de la calibration des niveaux (public/data/difficulty.json).
const SEATS: { label: string; bot: Bot }[] = [
    { label: 'fort (v3)', bot: policy },
    { label: 'moyen', bot: makeTemperedBot(scorer, 0.179, 'moyen') },
    { label: 'faible', bot: makeTemperedBot(scorer, 0.378, 'faible') },
    { label: 'hasard', bot: randomBot },
]

const grid = ALL_GRIDS[0]
const bySeat = new Map<number, DecisionObservation[]>(SEATS.map((_, i) => [i, []]))

// Plusieurs parties : une seule ne fournit pas assez de decisions par siege.
for (let g = 0; g < 6; g++) {
    playMultiGame(grid.cells, SEATS.map(s => s.bot), makeRng(SEED + g * 7919), {
        maxTurns: 60,
        observe: obs => {
            const list = bySeat.get(obs.seat)!
            if (list.length < PER_SEAT && obs.candidates.length > 3) list.push(obs)
        },
    })
}

console.log("Pouvoir de discrimination de l'analyse")
console.log(`  ${ROLLOUTS} deroulements, criblage ${SCREEN}, pretendants ${SHORTLIST}, horizon ${HORIZON}`)
console.log(`  grille ${grid.id}, table de 4, ${PER_SEAT} decisions visees par siege\n`)

const VERDICTS: Verdict[] = ['excellent', 'bon', 'imprecision', 'erreur', 'faute']
const allLosses: number[] = []

console.log('  niveau        n   ecart moyen   median   p90     bon groupe   repartition des verdicts')
console.log('  ' + '-'.repeat(100))

const started = Date.now()
let analysed = 0

for (const [seat, { label }] of SEATS.map((s, i) => [i, s] as const)) {
    const obs = bySeat.get(seat)!
    const losses: number[] = []
    const counts = new Map<Verdict, number>(VERDICTS.map(v => [v, 0]))
    let inGoodGroup = 0

    for (const o of obs) {
        const v = analyseDecision(
            {
                cells: grid.cells,
                players: o.players,
                seat: o.seat,
                turn: o.turn,
                candidates: o.candidates,
                played: o.played,
            },
            {
                rolloutBot: policy,
                rollouts: ROLLOUTS,
                screenRollouts: SCREEN,
                shortlist: SHORTLIST,
                horizon: HORIZON,
                seed: 31337,
            },
        )
        losses.push(v.loss)
        counts.set(v.verdict, (counts.get(v.verdict) ?? 0) + 1)
        if (v.playedWasGood) inGoodGroup++
        analysed++
    }

    if (!losses.length) continue
    allLosses.push(...losses)
    const sorted = [...losses].sort((a, b) => a - b)
    const avg = losses.reduce((a, b) => a + b, 0) / losses.length
    const median = sorted[Math.floor(sorted.length / 2)]
    const p90 = sorted[Math.floor(sorted.length * 0.9)]
    const mix = VERDICTS.map(v => `${v[0].toUpperCase()}${counts.get(v)}`).join(' ')

    console.log(
        `  ${label.padEnd(11)} ${String(losses.length).padStart(3)}   `
        + `${avg.toFixed(2).padStart(11)}   ${median.toFixed(2).padStart(6)}   ${p90.toFixed(2).padStart(5)}   `
        + `${String(Math.round(100 * inGoodGroup / losses.length)).padStart(8)} %   ${mix}`,
    )
}

const elapsed = Date.now() - started
console.log('  ' + '-'.repeat(100))
console.log(`  ${analysed} decisions analysees en ${(elapsed / 1000).toFixed(0)} s, soit ${(elapsed / Math.max(1, analysed)).toFixed(0)} ms par decision`)

// Seuils deduits de la distribution observee, tous niveaux confondus.
const s = [...allLosses].sort((a, b) => a - b)
const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
console.log(`\n  Distribution des ecarts (n=${s.length}) :`)
console.log(`    p50 ${q(0.5).toFixed(2)}   p75 ${q(0.75).toFixed(2)}   p90 ${q(0.9).toFixed(2)}   p95 ${q(0.95).toFixed(2)}   max ${s[s.length - 1].toFixed(2)}`)
console.log(`\n  Seuils suggeres : erreur a p75 = ${q(0.75).toFixed(2)}, faute a p90 = ${q(0.9).toFixed(2)}`)
console.log('  (V = verdicts : Excellent, Bon, Imprecision, Erreur, Faute)')
