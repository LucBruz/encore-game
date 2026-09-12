/**
 * Cout et pouvoir de discrimination de l'analyse d'apres-partie.
 *
 *   corepack pnpm analyse:cost
 *   corepack pnpm analyse:cost -- --decisions 40 --budgets 4,8,16,32,64
 *
 * La question a trancher n'est pas « combien de temps ça prend » mais « combien
 * de deroulements faut-il pour que les verdicts veuillent dire quelque chose ».
 * Un budget trop faible produit des intervalles si larges qu'aucun coup n'est
 * distinguable du meilleur : l'analyse tourne vite et ne dit rien.
 *
 * On mesure donc, par budget : le temps par decision, et la part des decisions
 * ou l'ecart au meilleur coup sort du bruit.
 */
import { readFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import type { Move } from '../engine/state'
import { makeGreedyV3Bot } from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { makeV3MoveScorer } from '../bots/scorers'
import { playMultiGame } from '../bots/playMulti'
import type { DecisionObservation } from '../bots/playMulti'
import { evaluateDecision, sameMove } from '../analysis/evaluate'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const DECISIONS = Number(arg('decisions', '30'))
const BUDGETS = arg('budgets', '4,8,16,32,64').split(',').map(Number)
const TOPK = Number(arg('topK', '6'))
/** `full` = deroulement jusqu'a la fin ; un nombre = troncature a N tours. */
const HORIZONS = arg('horizons', 'full').split(',')
const SEED = Number(arg('seed', '424242'))
const SEAT = Number(arg('seat', '0'))

const W: WeightsV3 = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
const policy = makeGreedyV3Bot(W, 'v3-multi')
const scorer = makeV3MoveScorer(W)

// ── Produire de vraies positions de decision ─────────────────────────────────
// On joue une partie a 4 avec la meilleure politique et on capture les
// decisions d'un siege. Ce sont donc des coups deja bons : si l'analyse les
// distingue, elle distinguera a plus forte raison ceux d'un humain.
const grid = ALL_GRIDS[0]
const observations: DecisionObservation[] = []

playMultiGame(
    grid.cells,
    [policy, policy, policy, policy],
    makeRng(SEED),
    {
        maxTurns: 60,
        observe: obs => { if (obs.seat === SEAT && obs.candidates.length > 2) observations.push(obs) },
    },
)

const sample = observations.slice(0, DECISIONS)

console.log(`Analyse d'apres-partie — cout et discrimination`)
console.log(`  grille ${grid.id}, siege ${SEAT}, ${sample.length} decisions reelles`)
console.log(`  candidats par decision : ${(sample.reduce((a, o) => a + o.candidates.length, 0) / Math.max(1, sample.length)).toFixed(1)} en moyenne, presélection topK=${TOPK}\n`)

if (sample.length === 0) {
    console.log('Aucune decision capturee — rien a mesurer.')
    process.exit(1)
}

console.log('  horizon   budget   temps/decision   perte moyenne   ecart type   decisions tranchees')
console.log('  ' + '-'.repeat(84))

for (const horizonArg of HORIZONS) {
for (const rollouts of BUDGETS) {
    const horizon = horizonArg === 'full' ? undefined : Number(horizonArg)
    const started = Date.now()
    let lossSum = 0
    let significant = 0
    let stderrSum = 0

    for (const obs of sample) {
        // Classement de preselection par l'heuristique, sur la position reelle.
        const mine = obs.players[obs.seat]
        const scored = scorer({
            cells: grid.cells,
            sheet: mine.sheet,
            moves: obs.candidates.filter((m): m is Move => m !== null),
            totalJokers: 8,
            turn: obs.turn,
            rng: makeRng(1),
        })
        const rank = new Map<Move | null, number>()
        for (const { move, value } of scored.moves) rank.set(move, value)
        rank.set(null, scored.passValue)

        const analysis = evaluateDecision(
            {
                cells: grid.cells,
                players: obs.players,
                seat: obs.seat,
                turn: obs.turn,
                candidates: obs.candidates,
                played: obs.played,
            },
            {
                rollouts,
                topK: TOPK,
                rolloutBot: policy,
                rank: move => rank.get(move) ?? -Infinity,
                seed: 7777,
                horizon,
            },
        )

        lossSum += analysis.loss
        stderrSum += analysis.lossStderr
        if (analysis.significant) significant++
    }

    const elapsed = Date.now() - started
    const perDecision = elapsed / sample.length
    console.log(
        `  ${horizonArg.padStart(7)}   ${String(rollouts).padStart(6)}   `
        + `${(perDecision).toFixed(0).padStart(10)} ms   `
        + `${(lossSum / sample.length).toFixed(3).padStart(13)}   `
        + `${(stderrSum / sample.length).toFixed(3).padStart(10)}   `
        + `${String(significant).padStart(3)} / ${sample.length}`,
    )
}
}

console.log('\n  Lecture : la perte moyenne doit se stabiliser quand le budget monte.')
console.log('  Tant que l\'ecart type reste du meme ordre que la perte, les verdicts')
console.log('  individuels ne sont pas exploitables, quelle que soit la vitesse.')
console.log(`\n  Cout d'une partie entiere ~ temps/decision x nombre de coups du joueur.`)
