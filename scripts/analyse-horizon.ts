/**
 * Quel horizon de troncature, et qu'est-ce qu'il coute en justesse ?
 *
 *   corepack pnpm analyse:horizon
 *   corepack pnpm analyse:horizon -- --decisions 25 --horizons 3,6,12
 *
 * Le critere « l'ordre des niveaux doit sortir » a echoue : la mesure ne
 * distingue pas deux joueurs proches, quel que soit l'horizon, donc elle ne
 * peut pas servir a choisir l'horizon non plus.
 *
 * Celui-ci est direct et repond a la seule question qui compte pour la review :
 * la troncature change-t-elle le VERDICT ? On compare, decision par decision,
 * le jugement rendu a horizon court avec celui du deroulement complet.
 *
 * Deux desaccords n'ont pas la meme gravite :
 *   - accuser a tort (bon selon la reference, mauvais selon l'horizon court)
 *     est une faute grave : la review reproche un coup correct ;
 *   - excuser a tort est benin : elle se tait sur un coup discutable.
 *
 * PIEGE, rencontre a la premiere execution : avec le meme budget que les
 * horizons courts, la reference n'a aucun pouvoir de rejet — elle ne classait
 * que 2 coups sur 24 hors du bon groupe, non parce que les autres etaient bons
 * mais parce que ses intervalles etaient trop larges pour rejeter quoi que ce
 * soit. Comparer a un etalon aveugle fabrique des « accusations a tort » qui
 * n'en sont pas. D'ou `--refRollouts`, nettement plus eleve que `--rollouts`.
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
import type { Bot } from '../bots/types'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const DECISIONS = Number(arg('decisions', '25'))
const HORIZONS = arg('horizons', '3,6,12').split(',').map(Number)
const ROLLOUTS = Number(arg('rollouts', '32'))
const SEED = Number(arg('seed', '818181'))
/**
 * Budget de la reference, distinct de celui des horizons courts.
 *
 * A 32 deroulements en horizon complet, l'erreur type vaut plusieurs points :
 * la reference ne rejette presque rien et son « bon groupe » est gonfle par son
 * propre bruit. Elle ne peut alors pas servir d'etalon. Il lui faut assez de
 * deroulements pour avoir du pouvoir de rejet.
 */
const REF_ROLLOUTS = Number(arg('refRollouts', '256'))

const W: WeightsV3 = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
const scorer = makeV3MoveScorer(W)
const policy = makeGreedyV3Bot(W, 'v3-multi')

// Melange de forces : on veut des coups bons ET des coups douteux, sinon
// l'accord est trivial parce que tout est bon.
const SEATS: Bot[] = [
    policy,
    makeTemperedBot(scorer, 0.179, 'moyen'),
    makeTemperedBot(scorer, 0.378, 'faible'),
    randomBot,
]

const grid = ALL_GRIDS[0]
const pool: DecisionObservation[] = []
for (let g = 0; g < 6 && pool.length < DECISIONS; g++) {
    playMultiGame(grid.cells, SEATS, makeRng(SEED + g * 7919), {
        maxTurns: 60,
        observe: obs => { if (pool.length < DECISIONS && obs.candidates.length > 3) pool.push(obs) },
    })
}

const toPosition = (o: DecisionObservation) => ({
    cells: grid.cells,
    players: o.players,
    seat: o.seat,
    turn: o.turn,
    candidates: o.candidates,
    played: o.played,
})

const common = {
    rolloutBot: policy,
    rollouts: ROLLOUTS,
    screenRollouts: 8,
    shortlist: 8,
    seed: 31337,
}

console.log('Accord entre horizon tronque et deroulement complet')
console.log(`  ${pool.length} decisions, ${ROLLOUTS} deroulements pour les horizons courts,`)
console.log(`  ${REF_ROLLOUTS} pour la reference, table de forces melangees\n`)

// Reference : deroulement complet. C'est la partie couteuse, faite une fois.
const refStart = Date.now()
const reference = pool.map(o => analyseDecision(toPosition(o), { ...common, rollouts: REF_ROLLOUTS }))
const refMs = (Date.now() - refStart) / pool.length
const refBad = reference.filter(r => !r.playedWasGood).length
console.log(`  reference (complet) : ${refMs.toFixed(0)} ms/decision, `
    + `${refBad} coups hors du bon groupe sur ${pool.length}\n`)

console.log('  horizon   ms/decision   accord   accusations a tort   omissions   correlation des ecarts')
console.log('  ' + '-'.repeat(92))

for (const horizon of HORIZONS) {
    const start = Date.now()
    const got = pool.map(o => analyseDecision(toPosition(o), { ...common, horizon }))
    const ms = (Date.now() - start) / pool.length

    let agree = 0, falseAccuse = 0, missed = 0
    for (let i = 0; i < pool.length; i++) {
        const refGood = reference[i].playedWasGood
        const gotGood = got[i].playedWasGood
        if (refGood === gotGood) agree++
        else if (refGood && !gotGood) falseAccuse++
        else missed++
    }

    // Correlation de Pearson entre les ecarts estimes, tronque contre complet.
    const xs = got.map(g => g.loss), ys = reference.map(r => r.loss)
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length
    const my = ys.reduce((a, b) => a + b, 0) / ys.length
    let num = 0, dx = 0, dy = 0
    for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2
    }
    const r = dx && dy ? num / Math.sqrt(dx * dy) : 0

    console.log(
        `  ${String(horizon).padStart(7)}   ${ms.toFixed(0).padStart(11)}   `
        + `${String(Math.round(100 * agree / pool.length)).padStart(5)} %   `
        + `${String(falseAccuse).padStart(18)}   ${String(missed).padStart(9)}   `
        + `${r.toFixed(2).padStart(21)}`,
    )
}

console.log('\n  Une accusation a tort est le desaccord grave : la review reproche un coup')
console.log('  que la reference juge defendable. Choisir l horizon le plus court dont le')
console.log('  nombre d accusations a tort reste nul ou negligeable.')
