/**
 * L'ecart entre bons et mauvais coups est-il mesurable ?
 *
 *   corepack pnpm analyse:spread
 *   corepack pnpm analyse:spread -- --decisions 8 --rollouts 32 --horizon 3
 *
 * C'est la question qui decide si une review de partie est honnete.
 *
 * Distinguer les deux MEILLEURS coups d'une position est hors de portee : leur
 * difference est minuscule et le bruit l'ecrase. Mais ce n'est pas ce qu'on
 * cherche. On cherche a dire « ce coup-la etait mauvais », ce qui suppose
 * seulement de separer le haut du classement du bas.
 *
 * On mesure donc, sur de vraies decisions et sur TOUS les coups legaux :
 *   - l'etendue : meilleur moins pire ;
 *   - le bruit : erreur type d'un ecart appaire ;
 *   - combien de coups sont indiscernables du meilleur (les « bons ») ;
 *   - combien sont nettement en dessous (les « mauvais »).
 *
 * Si l'etendue est du meme ordre que le bruit, aucun verdict n'est tenable.
 */
import { readFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { makeGreedyV3Bot } from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { playMultiGame } from '../bots/playMulti'
import type { DecisionObservation } from '../bots/playMulti'
import { evaluateDecision, sameMove } from '../analysis/evaluate'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const DECISIONS = Number(arg('decisions', '8'))
const ROLLOUTS = Number(arg('rollouts', '32'))
const HORIZON = Number(arg('horizon', '3'))
const SEED = Number(arg('seed', '424242'))
const SEAT = Number(arg('seat', '0'))

const W: WeightsV3 = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
const policy = makeGreedyV3Bot(W, 'v3-multi')
const grid = ALL_GRIDS[0]

const observations: DecisionObservation[] = []
playMultiGame(grid.cells, [policy, policy, policy, policy], makeRng(SEED), {
    maxTurns: 60,
    observe: obs => { if (obs.seat === SEAT && obs.candidates.length > 3) observations.push(obs) },
})
const sample = observations.slice(0, DECISIONS)

console.log('Etendue des coups legaux contre bruit de mesure')
console.log(`  grille ${grid.id}, ${sample.length} decisions, ${ROLLOUTS} deroulements, horizon ${HORIZON}`)
console.log('  tous les coups legaux sont evalues, sans preselection\n')
console.log('  tour   coups   meilleur    pire   etendue   bruit   indiscernables   rang du coup joue')
console.log('  ' + '-'.repeat(88))

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

let spreadSum = 0, noiseSum = 0, goodSum = 0, playedRankSum = 0, n = 0

for (const obs of sample) {
    const analysis = evaluateDecision(
        {
            cells: grid.cells,
            players: obs.players,
            seat: obs.seat,
            turn: obs.turn,
            candidates: obs.candidates,
            played: obs.played,
        },
        { rollouts: ROLLOUTS, rolloutBot: policy, seed: 7777, horizon: HORIZON },
    )

    // Moitie d'estimation : les memes indices que ceux utilises pour la perte.
    const half = Math.floor(ROLLOUTS / 2)
    const idx = analysis.candidates[0].samples.map((_, i) => i).filter(i => i >= half)
    const scoreOf = (c: typeof analysis.candidates[number]) => mean(idx.map(i => c.samples[i]))

    const scored = analysis.candidates.map(c => ({ c, v: scoreOf(c) })).sort((a, b) => b.v - a.v)
    const best = scored[0]
    const worst = scored[scored.length - 1]
    const spread = best.v - worst.v

    // Bruit : erreur type de l'ecart appaire entre le meilleur et chaque autre.
    const stderrs = scored.slice(1).map(({ c }) => {
        const diffs = idx.map(i => best.c.samples[i] - c.samples[i])
        const m = mean(diffs)
        const varr = diffs.length > 1
            ? diffs.reduce((a, d) => a + (d - m) ** 2, 0) / (diffs.length - 1) : 0
        return Math.sqrt(varr / diffs.length)
    })
    const noise = stderrs.length ? mean(stderrs) : 0

    // « Indiscernable du meilleur » : l'intervalle a 95 % de l'ecart contient zero.
    let indistinguishable = 1
    scored.slice(1).forEach(({ c }, k) => {
        const diffs = idx.map(i => best.c.samples[i] - c.samples[i])
        const m = mean(diffs)
        if (m - 1.96 * stderrs[k] <= 0) indistinguishable++
    })

    const playedRank = scored.findIndex(({ c }) => sameMove(c.move, obs.played)) + 1

    console.log(
        `  ${String(obs.turn).padStart(4)}   ${String(analysis.candidates.length).padStart(5)}   `
        + `${best.v.toFixed(2).padStart(8)}   ${worst.v.toFixed(2).padStart(5)}   `
        + `${spread.toFixed(2).padStart(7)}   ${noise.toFixed(2).padStart(5)}   `
        + `${String(indistinguishable).padStart(14)}   ${String(playedRank).padStart(17)}`,
    )

    spreadSum += spread; noiseSum += noise; goodSum += indistinguishable
    playedRankSum += playedRank; n++
}

if (n) {
    console.log('  ' + '-'.repeat(88))
    console.log(
        `  moyennes : etendue ${(spreadSum / n).toFixed(2)}   bruit ${(noiseSum / n).toFixed(2)}   `
        + `rapport ${(spreadSum / noiseSum).toFixed(1)}x   `
        + `coups indiscernables du meilleur ${(goodSum / n).toFixed(1)}   `
        + `rang moyen du coup joue ${(playedRankSum / n).toFixed(1)}`,
    )
    console.log('\n  Un rapport etendue/bruit nettement superieur a 1 signifie qu on peut')
    console.log('  separer le haut du bas du classement, donc dire « ce coup etait mauvais »')
    console.log('  sans pouvoir pour autant departager les meilleurs entre eux.')
}
