/**
 * Calibration des niveaux de difficulte.
 *
 *   corepack pnpm calibrate
 *   corepack pnpm calibrate -- --targets 20,30 --games 600
 *
 * Le principe : UNE politique, un seul bouton. La temperature du softmax degrade la
 * meilleure politique de facon continue, de "toujours le meilleur coup" a "presque
 * au hasard". Chaque niveau est ensuite CALIBRE par mesure sur un score cible, au
 * lieu d'etre regle au jugé.
 *
 * Pourquoi ne pas prendre random / greedy / greedy-cem comme easy / medium / hard :
 * l'echelle serait absurde. random est a ~7 ecarts-types sous greedy (injouable
 * comme "facile"), et greedy n'est qu'a 1 ecart-type sous greedy-cem (indistinguable
 * en une partie). Une echelle faite d'artefacts historiques est mal espacee par
 * accident.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { makeTemperedBot } from '../bots/difficulty'
import type { MoveScorer } from '../bots/difficulty'
import { makeV1MoveScorer, makeV3MoveScorer } from '../bots/scorers'
import { playGame } from '../bots/play'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const GAMES = Number(arg('games', '600'))
const SEED = Number(arg('seed', '818181'))
const TARGETS = arg('targets', '20,30').split(',').map(Number)
const OUT = arg('out', 'public/data/difficulty.json')

function loadTuned(path: string): any | null {
    try { return JSON.parse(readFileSync(path, 'utf8')).tuned } catch { return null }
}

// La politique de base est la meilleure disponible : v3 si elle a ete optimisee,
// sinon la v1 optimisee.
const tunedV3 = loadTuned('public/data/tuned-weights-v3.json')
const tunedV1 = loadTuned('public/data/tuned-weights.json')
const scorer: MoveScorer = tunedV3 ? makeV3MoveScorer(tunedV3) : makeV1MoveScorer(tunedV1)
const policyName = tunedV3 ? 'greedy-v3' : 'greedy-cem'

function scoreAt(temperature: number, games = GAMES): { mean: number; stdev: number } {
    const bot = makeTemperedBot(scorer, temperature, `T=${temperature}`)
    const scores: number[] = []
    for (let i = 0; i < games; i++) {
        const grid = ALL_GRIDS[i % ALL_GRIDS.length]
        scores.push(playGame(grid.cells, bot, makeRng(SEED + i * 7919), { maxTurns: 50 }).score)
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length
    const stdev = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length)
    return { mean, stdev }
}

/**
 * Le score decroit de facon monotone avec la temperature, donc une dichotomie
 * suffit — pas besoin d'une recherche plus savante.
 */
function temperatureFor(target: number): { temperature: number; mean: number; stdev: number } {
    let lo = 0
    let hi = 8
    let best = { temperature: hi, ...scoreAt(hi, Math.min(GAMES, 300)) }

    for (let step = 0; step < 12; step++) {
        const mid = (lo + hi) / 2
        const r = scoreAt(mid, Math.min(GAMES, 300))
        if (r.mean > target) lo = mid
        else hi = mid
        best = { temperature: mid, ...r }
    }

    // Mesure finale a pleine taille sur la temperature retenue.
    const final = scoreAt(best.temperature)
    return { temperature: best.temperature, ...final }
}

console.log(`Calibration des niveaux — politique de base : ${policyName}`)
console.log(`  ${GAMES} parties par mesure, graine ${SEED}, 8 grilles en rotation\n`)

const hard = scoreAt(0)
console.log(`  hard    T = 0.000   moyenne ${hard.mean.toFixed(2)}   ecart-type ${hard.stdev.toFixed(2)}`)

const levels = [{ id: 'hard', temperature: 0, ...hard }]

for (const target of TARGETS) {
    const r = temperatureFor(target)
    const id = target === Math.max(...TARGETS) ? 'medium' : 'easy'
    console.log(
        `  ${id.padEnd(7)} T = ${r.temperature.toFixed(3)}   moyenne ${r.mean.toFixed(2)}`
        + `   ecart-type ${r.stdev.toFixed(2)}   (cible ${target})`,
    )
    levels.push({ id, temperature: r.temperature, mean: r.mean, stdev: r.stdev })
}

levels.sort((a, b) => a.mean - b.mean)

console.log('\nEchelle obtenue :')
for (let i = 0; i < levels.length; i++) {
    const l = levels[i]
    const gap = i > 0 ? ` (+${(l.mean - levels[i - 1].mean).toFixed(1)} pts, ${((l.mean - levels[i - 1].mean) / l.stdev).toFixed(1)} ecart-type)` : ''
    console.log(`  ${l.id.padEnd(7)} ${l.mean.toFixed(2)}${gap}`)
}

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(OUT, JSON.stringify({ policy: policyName, games: GAMES, seed: SEED, levels }, null, 2))
console.log(`\nEcrit dans ${OUT}`)
