/**
 * Tournoi multijoueur : 4 agents a la meme table, vraie regle.
 *
 *   pnpm duel -- --seats 2 --seed 5250000 --valueNet public/data/value-net-mix.json --heads margin --search 4:16:4
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
import { makeGreedyV3Bot } from '../bots/heuristicV3'
import type { WeightsV3 } from '../bots/heuristicV3'
import { playMultiGame } from '../bots/playMulti'
import { makeDenialBot } from '../bots/baselines/denial'
import { loadValueNet, makeValueNetBot, makeValueNetDenialBot } from '../bots/valueNet'
import { makeSearchBot } from '../bots/search'
import type { Bot } from '../bots/types'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const GAMES = Number(arg('games', '2000'))
// Tranche d'un tournoi plus long : parties FROM .. FROM + GAMES - 1, memes des et meme
// rotation que dans le tournoi entier. Fusion : scripts/merge-duels.ts.
const FROM = Number(arg('from', '0'))
const SEED = Number(arg('seed', '31415'))
const MAX_TURNS = Number(arg('maxTurns', '60'))
const OUT = arg('out', 'training/runs/duel.json')

const load = (p: string) => JSON.parse(readFileSync(p, 'utf8')).tuned

// La reference : l'heuristique v3 reglee en partie multijoueur, celle du jeu.
const vMulti: WeightsV3 = load('public/data/tuned-weights-multi.json')
const bots: Bot[] = [makeGreedyV3Bot(vMulti, 'v3-multi')]

// Meme heuristique + deni de des (`bots/baselines/denial.ts`) : l'adversaire de
// reference des mesures du reseau, parce qu'il partage son objectif (regarder ce
// qu'un coup laisse aux autres).  --denials 0.8
const DENIALS = arg('denials', '0.8').split(',').map(Number).filter(x => x > 0)
for (const w of DENIALS) {
    bots.push(makeDenialBot({ weights: vMulti, denialWeight: w, name: `deni-${w}` }))
}

// Reseaux de valeur (`training/train_rollouts.py`), une entree par chemin et par tete.
//   --valueNet public/data/value-net-mix.json --heads margin
// A mesurer sur des graines jamais vues a l'entrainement : --seed 5250000.
const VALUE_NETS = arg('valueNet', '').split(',').filter(Boolean)
const HEADS = arg('heads', 'score').split(',').filter(Boolean) as ('score' | 'margin')[]
const NET_DENIALS = arg('netDenials', '').split(',').map(Number).filter(x => x > 0)
const SEARCHES = arg('search', '').split(',').filter(Boolean)
for (const path of VALUE_NETS) {
    const net = loadValueNet(JSON.parse(readFileSync(path, 'utf8')))
    const label = VALUE_NETS.length > 1 ? path.replace(/^.*[\\/]/, '').replace(/\.json$/, '') : 'reseau'
    for (const head of HEADS) bots.push(makeValueNetBot(net, `${label}-${head}`, head))
    // Reseau + deni de des :  --netDenials 0.5,1  ->  reseau-margin-deni-0.5, ...
    for (const w of NET_DENIALS) for (const head of HEADS) {
        bots.push(makeValueNetDenialBot(net, { head, denialWeight: w, name: `${label}-${head}-deni-${w}` }))
    }
    // Recherche au moment de jouer :  --search 4:16:4,4:16:4:1  (candidats:simulations:tours[:deni])
    // -> recherche-k4-r16-h4, recherche-k4-r16-h4-d1. Adversaires simules par v3-multi.
    for (const spec of SEARCHES) {
        const [topK, rollouts, horizon, denialWeight = 0] = spec.split(':').map(Number)
        const name = `recherche-k${topK}-r${rollouts}-h${horizon}${denialWeight ? `-d${denialWeight}` : ''}`
        bots.push(makeSearchBot(net, {
            topK, rollouts, horizon, denialWeight, name,
            opponentBot: makeGreedyV3Bot(vMulti, 'v3-multi-modele'),
        }))
    }
}

// Table restreinte, pour que deux agents se croisent a chaque partie et que
// l'ecart apparie porte sur toutes les parties :  --only v3-multi,reseau-score
const ONLY = arg('only', '').split(',').filter(Boolean)
if (ONLY.length) {
    const missing = ONLY.filter(n => !bots.some(b => b.name === n))
    if (missing.length) throw new Error(`agents inconnus : ${missing.join(', ')}`)
    bots.splice(0, bots.length, ...bots.filter(b => ONLY.includes(b.name)))
}

const SEATS = Number(arg('seats', '4'))
const B = bots.length

const totals = new Array(B).fill(0)
const played = new Array(B).fill(0)
const wins = new Array(B).fill(0)
// `winnerIndex` tranche les egalites par le siege le plus bas. La rotation rend ce
// biais symetrique, mais un taux de victoire ne doit pas dependre de l'arbitrage :
// `shares` partage la partie entre les sieges a egalite, et `tied` compte ces parties.
const shares = new Array(B).fill(0)
let tiedGames = 0
const ends = new Array(B).fill(0)
const passes = new Array(B).fill(0)
const jokers = new Array(B).fill(0)
/** scoreByGame[bot][g] = score de cet agent a la partie g, ou null s'il n'y jouait pas. */
const scoreByGame: (number | null)[][] = bots.map(() => [])
let totalTurns = 0
let natural = 0

for (let g = FROM; g < FROM + GAMES; g++) {
    const grid = ALL_GRIDS[g % ALL_GRIDS.length]

    // Table de 4 tiree parmi B agents, en rotation : sur B parties consecutives
    // chaque agent occupe chaque siege autant de fois, donc ni l'ordre de jeu ni
    // la composition de table ne favorisent personne.
    const seating = Array.from({ length: SEATS }, (_, seat) => (g + seat) % B)
    const table = seating.map(i => bots[i])

    const r = playMultiGame(grid.cells, table, makeRng(SEED + g * 7919), { maxTurns: MAX_TURNS })

    // Avec moins d'agents que de sieges, un agent occupe plusieurs sieges : son
    // score de la partie est la moyenne de ses sieges, pas le dernier ecrit.
    const gameSum = new Array(B).fill(0)
    const gameSeats = new Array(B).fill(0)
    bots.forEach((_, i) => scoreByGame[i].push(null))
    seating.forEach((botIdx, seat) => {
        gameSum[botIdx] += r.scores[seat]
        gameSeats[botIdx]++
        scoreByGame[botIdx][g - FROM] = gameSum[botIdx] / gameSeats[botIdx]
        totals[botIdx] += r.scores[seat]
        played[botIdx]++
        passes[botIdx] += r.passes[seat]
        jokers[botIdx] += r.jokersUsed[seat]
        if (r.winnerIndex === seat) wins[botIdx]++
        if (r.enderIndex === seat) ends[botIdx]++
    })
    const top = Math.max(...r.scores)
    const topSeats = r.scores.map((v, seat) => (v === top ? seat : -1)).filter(seat => seat >= 0)
    if (topSeats.length > 1) tiedGames++
    for (const seat of topSeats) shares[seating[seat]] += 1 / topSeats.length

    totalTurns += r.turns
    if (r.endedNaturally) natural++
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => {
    const m = mean(xs)
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

console.log(`Tournoi — ${GAMES} parties de ${SEATS} joueurs parmi ${B} agents, 8 grilles, rotation des sieges`)
console.log(`  duree moyenne ${(totalTurns / GAMES).toFixed(1)} tours, ${(100 * natural / GAMES).toFixed(1)} % finies par 2 couleurs, `
    + `${(100 * tiedGames / GAMES).toFixed(1)} % a egalite
`)

const pad = (s: string | number, w: number) => String(s).padStart(w)
console.log(`${'agent'.padEnd(18)} ${pad('parties', 8)} ${pad('score moy', 10)} ${pad('victoires', 10)} ${pad('partagees', 10)} ${pad('a fini', 8)} ${pad('passes', 8)} ${pad('jokers', 8)}`)
const order = bots.map((_, i) => i).sort((a, b) => totals[b] / played[b] - totals[a] / played[a])
for (const i of order) {
    console.log(
        `${bots[i].name.padEnd(18)} ${pad(played[i], 8)} ${pad((totals[i] / played[i]).toFixed(2), 10)}`
        + ` ${pad(`${(100 * wins[i] / played[i]).toFixed(1)} %`, 10)}`
        + ` ${pad(`${(100 * shares[i] / played[i]).toFixed(1)} %`, 10)}`
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
    games: GAMES, from: FROM, seed: SEED, seats: SEATS, maxTurns: MAX_TURNS,
    // Comptes bruts et scores partie par partie : de quoi fusionner des tranches.
    raw: {
        totalTurns, natural, tiedGames,
        agents: bots.map((b, i) => ({
            name: b.name, totals: totals[i], played: played[i], wins: wins[i], shares: shares[i],
            ends: ends[i], passes: passes[i], jokers: jokers[i], perGame: scoreByGame[i],
        })),
    },
    meanTurns: +(totalTurns / GAMES).toFixed(1),
    naturalEndRate: +(natural / GAMES).toFixed(3),
    tieRate: +(tiedGames / GAMES).toFixed(3),
    agents: order.map(i => ({
        name: bots[i].name,
        games: played[i],
        meanScore: +(totals[i] / played[i]).toFixed(2),
        winRate: +(100 * wins[i] / played[i]).toFixed(1),
        winShare: +(100 * shares[i] / played[i]).toFixed(1),
        endRate: +(100 * ends[i] / played[i]).toFixed(1),
        meanPasses: +(passes[i] / played[i]).toFixed(2),
        meanJokers: +(jokers[i] / played[i]).toFixed(2),
    })),
}, null, 2))
console.log(`
Ecrit dans ${OUT}`)
