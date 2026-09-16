/**
 * Fusionne les tranches d'un tournoi joue en parallele (`duel.ts --from`).
 *
 *   npx tsx scripts/merge-duels.ts training/runs/x/shard-*.json --out training/runs/x/duel.json
 *
 * Les tranches doivent couvrir des parties disjointes du MEME tournoi (meme graine,
 * memes agents, meme nombre de sieges) : c'est verifie. Le resultat est identique a
 * celui d'un seul processus, ecarts apparies compris.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const OUT = outIdx !== -1 ? args[outIdx + 1] : null
const files = args.filter((a, i) => a !== '--out' && (outIdx === -1 || i !== outIdx + 1))

const shards = files.map(f => JSON.parse(readFileSync(f, 'utf8'))).sort((a, b) => a.from - b.from)
const first = shards[0]
for (const s of shards) {
    if (!s.raw) throw new Error('tranche sans comptes bruts : relancer avec la version actuelle de duel.ts')
    if (s.seed !== first.seed || s.seats !== first.seats) throw new Error('tranches de tournois differents')
    const names = s.raw.agents.map((a: any) => a.name).join(',')
    if (names !== first.raw.agents.map((a: any) => a.name).join(',')) throw new Error('agents differents')
}
for (let k = 1; k < shards.length; k++) {
    if (shards[k].from < shards[k - 1].from + shards[k - 1].games) throw new Error('tranches qui se chevauchent')
}

const games = shards.reduce((a, s) => a + s.games, 0)
const agents = first.raw.agents.map((a: any, i: number) => {
    const sum = (k: string) => shards.reduce((acc, s) => acc + s.raw.agents[i][k], 0)
    return {
        name: a.name, totals: sum('totals'), played: sum('played'), wins: sum('wins'), shares: sum('shares'),
        ends: sum('ends'), passes: sum('passes'), jokers: sum('jokers'),
        perGame: shards.flatMap(s => s.raw.agents[i].perGame) as (number | null)[],
    }
})
const totalTurns = shards.reduce((a, s) => a + s.raw.totalTurns, 0)
const natural = shards.reduce((a, s) => a + s.raw.natural, 0)
const tied = shards.reduce((a, s) => a + s.raw.tiedGames, 0)

const pct = (x: number) => `${(100 * x).toFixed(1)} %`
console.log(`Fusion de ${shards.length} tranches — ${games} parties, ${first.seats} joueurs, graine ${first.seed}`)
console.log(`  duree moyenne ${(totalTurns / games).toFixed(1)} tours, ${pct(tied / games)} a egalite\n`)
const order = agents.map((_: any, i: number) => i).sort((a: number, b: number) =>
    agents[b].totals / agents[b].played - agents[a].totals / agents[a].played)
for (const i of order) {
    const a = agents[i]
    console.log(`${a.name.padEnd(26)} ${String(a.played).padStart(6)}  score ${(a.totals / a.played).toFixed(2)}`
        + `  victoires ${pct(a.wins / a.played)}  partagees ${pct(a.shares / a.played)}  a fini ${pct(a.ends / a.played)}`)
}
const ref = order[0]
console.log(`\nEcarts apparies contre ${agents[ref].name} :`)
for (const i of order) {
    if (i === ref) continue
    const d: number[] = []
    agents[i].perGame.forEach((v: number | null, g: number) => {
        const r = agents[ref].perGame[g]
        if (v !== null && r !== null) d.push(v - r)
    })
    const m = d.reduce((x, y) => x + y, 0) / d.length
    const sd = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / d.length)
    const se = sd / Math.sqrt(d.length)
    console.log(`  ${agents[i].name.padEnd(26)} ${m >= 0 ? '+' : ''}${m.toFixed(2)} [${(m - 1.96 * se).toFixed(2)}, ${(m + 1.96 * se).toFixed(2)}] sur ${d.length} parties`)
}
if (OUT) {
    writeFileSync(OUT, JSON.stringify({
        games, seed: first.seed, seats: first.seats, tieRate: +(tied / games).toFixed(3),
        agents: order.map((i: number) => ({
            name: agents[i].name, games: agents[i].played,
            meanScore: +(agents[i].totals / agents[i].played).toFixed(2),
            winRate: +(100 * agents[i].wins / agents[i].played).toFixed(1),
            winShare: +(100 * agents[i].shares / agents[i].played).toFixed(1),
            endRate: +(100 * agents[i].ends / agents[i].played).toFixed(1),
        })),
    }, null, 2))
    console.log(`\nEcrit dans ${OUT}`)
}
