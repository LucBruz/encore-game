/**
 * Tournoi multijoueur : 4 agents a la meme table, vraie regle.
 *
 *   corepack pnpm duel
 *   corepack pnpm duel -- --games 3000
 *
 * Pourquoi ce script existe : toute l'optimisation precedente est MONO-AGENT, et
 * le solitaire ne punit pas la temporisation — un agent qui passe souvent et
 * thesaurise ses jokers ne perd rien puisqu'il decide seul quand la partie
 * s'arrete. Ici c'est le premier joueur a completer deux couleurs qui coupe tout
 * le monde, et le joueur actif retire sa paire de des aux autres.
 *
 * Chaque agent occupe chaque siege a tour de role (rotation), pour que l'ordre de
 * jeu ne favorise personne.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { makeGreedyBot } from '../bots/baselines/basic'
import { makeGreedyV3Bot, V3Scorer } from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { gridStats } from '../engine/scoring'
import { playMultiGame } from '../bots/playMulti'
import type { Bot, TurnContext } from '../bots/types'
import type { Cells } from '../engine/types'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const GAMES = Number(arg('games', '2000'))
const SEED = Number(arg('seed', '31415'))
const MAX_TURNS = Number(arg('maxTurns', '60'))
const OUT = arg('out', 'public/data/duel.json')

const load = (p: string) => JSON.parse(readFileSync(p, 'utf8')).tuned

const v3h50: WeightsV3 = load('public/data/tuned-weights-v3-h50.json')
const v1 = load('public/data/tuned-weights.json')
const vMulti: WeightsV3 | null = (() => { try { return load('public/data/tuned-weights-multi.json') } catch { return null } })()

/** Meme evaluation, mais le passe volontaire est interdit. */
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

const bots: Bot[] = [
    // 1. Le parametrage actuel : thesaurise les jokers, passe volontiers.
    makeGreedyV3Bot(v3h50, 'v3-thesauriseur'),
    // 2. Memes poids, mais interdiction de passer volontairement.
    makeV3NoPass(v3h50, 'v3-sans-passe'),
    // 3. Memes poids, joker bon marche : il le depense au lieu de passer.
    makeGreedyV3Bot({ ...v3h50, jokerValue: 1.5 }, 'v3-joker-1.5'),
    // 4. Le champion precedent, sans aucune notion de forme ni de tour.
    makeGreedyBot(v1, 'greedy-cem'),
]

// 5. Optimise directement en partie a 4 : il remplace le thesauriseur, qui n'a
// plus d'interet que comme temoin de ce que produit un cadrage solitaire.
if (vMulti) bots.push(makeGreedyV3Bot(vMulti, 'v3-multi'))

const SEATS = 4
const B = bots.length

const totals = new Array(B).fill(0)
const played = new Array(B).fill(0)
const wins = new Array(B).fill(0)
const ends = new Array(B).fill(0)
const passes = new Array(B).fill(0)
const jokers = new Array(B).fill(0)
/** scoreByGame[bot][g] = score de cet agent a la partie g, ou null s'il n'y jouait pas. */
const scoreByGame: (number | null)[][] = bots.map(() => [])
let totalTurns = 0
let natural = 0

for (let g = 0; g < GAMES; g++) {
    const grid = ALL_GRIDS[g % ALL_GRIDS.length]

    // Table de 4 tiree parmi B agents, en rotation : sur B parties consecutives
    // chaque agent occupe chaque siege autant de fois, donc ni l'ordre de jeu ni
    // la composition de table ne favorisent personne.
    const seating = Array.from({ length: SEATS }, (_, seat) => (g + seat) % B)
    const table = seating.map(i => bots[i])

    const r = playMultiGame(grid.cells, table, makeRng(SEED + g * 7919), { maxTurns: MAX_TURNS })

    bots.forEach((_, i) => scoreByGame[i].push(null))
    seating.forEach((botIdx, seat) => {
        totals[botIdx] += r.scores[seat]
        played[botIdx]++
        scoreByGame[botIdx][g] = r.scores[seat]
        passes[botIdx] += r.passes[seat]
        jokers[botIdx] += r.jokersUsed[seat]
        if (r.winnerIndex === seat) wins[botIdx]++
        if (r.enderIndex === seat) ends[botIdx]++
    })
    totalTurns += r.turns
    if (r.endedNaturally) natural++
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => {
    const m = mean(xs)
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

console.log(`Tournoi — ${GAMES} parties de ${SEATS} joueurs parmi ${B} agents, 8 grilles, rotation des sieges`)
console.log(`  duree moyenne ${(totalTurns / GAMES).toFixed(1)} tours, ${(100 * natural / GAMES).toFixed(1)} % finies par 2 couleurs
`)

const pad = (s: string | number, w: number) => String(s).padStart(w)
console.log(`${'agent'.padEnd(18)} ${pad('parties', 8)} ${pad('score moy', 10)} ${pad('victoires', 10)} ${pad('a fini', 8)} ${pad('passes', 8)} ${pad('jokers', 8)}`)
const order = bots.map((_, i) => i).sort((a, b) => totals[b] / played[b] - totals[a] / played[a])
for (const i of order) {
    console.log(
        `${bots[i].name.padEnd(18)} ${pad(played[i], 8)} ${pad((totals[i] / played[i]).toFixed(2), 10)}`
        + ` ${pad(`${(100 * wins[i] / played[i]).toFixed(1)} %`, 10)}`
        + ` ${pad(`${(100 * ends[i] / played[i]).toFixed(1)} %`, 8)}`
        + ` ${pad((passes[i] / played[i]).toFixed(2), 8)}`
        + ` ${pad((jokers[i] / played[i]).toFixed(2), 8)}`,
    )
}

// Ecarts apparies contre le meilleur : memes parties, memes des.
const ref = order[0]
console.log(`\nEcarts apparies contre ${bots[ref].name} :`)
for (const i of order) {
    if (i === ref) continue
    // Uniquement les parties ou les DEUX agents etaient a table : la rotation
    // fait qu'ils ne se croisent pas a chaque partie.
    const d: number[] = []
    for (let g = 0; g < GAMES; g++) {
        const a = scoreByGame[i][g]
        const b = scoreByGame[ref][g]
        if (a !== null && b !== null) d.push(a - b)
    }
    if (d.length < 30) {
        console.log(`  ${bots[i].name.padEnd(18)} trop peu de parties communes (${d.length})`)
        continue
    }
    const m = mean(d)
    const se = sd(d) / Math.sqrt(d.length)
    const sig = Math.abs(m) > 1.96 * se
    console.log(
        `  ${bots[i].name.padEnd(18)} ${m >= 0 ? '+' : ''}${m.toFixed(2)}`
        + ` [${(m - 1.96 * se).toFixed(2)}, ${(m + 1.96 * se).toFixed(2)}]`
        + ` sur ${d.length} parties${sig ? '' : '   non significatif'}`,
    )
}

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(OUT, JSON.stringify({
    games: GAMES, seats: SEATS, maxTurns: MAX_TURNS,
    meanTurns: +(totalTurns / GAMES).toFixed(1),
    naturalEndRate: +(natural / GAMES).toFixed(3),
    agents: order.map(i => ({
        name: bots[i].name,
        games: played[i],
        meanScore: +(totals[i] / played[i]).toFixed(2),
        winRate: +(100 * wins[i] / played[i]).toFixed(1),
        endRate: +(100 * ends[i] / played[i]).toFixed(1),
        meanPasses: +(passes[i] / played[i]).toFixed(2),
        meanJokers: +(jokers[i] / played[i]).toFixed(2),
    })),
}, null, 2))
console.log(`
Ecrit dans ${OUT}`)
