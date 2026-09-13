import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useGameStore } from '~/stores/gameStore'
import { makeGreedyV3Bot } from '~~/bots/heuristicV3'
import type { WeightsV3 } from '~~/bots/heuristicV3'
import { reviewGame } from '~~/analysis/game'
import { sameMove } from '~~/analysis/evaluate'
import { replayDecisions } from '~~/analysis/replay'
import type { GameEvent } from '~~/analysis/replay'

/**
 * Review d'une VRAIE partie, lue en direct depuis Supabase.
 *
 * Ignore par defaut : il faut une partie et un acces en lecture.
 *
 *   GAME_ID=<uuid> SUPABASE_URL=... SUPABASE_KEY=<cle publique> \
 *     corepack pnpm exec vitest run analysis/__tests__/live-review.spec.ts
 *
 * Existe parce qu'il faut pouvoir verifier la page de review sans navigateur :
 * dans un onglet masque, Chrome bride les minuteries et l'analyse y devient
 * plusieurs fois plus lente que dans un onglet visible, au point de rendre la
 * page illisible par un outil automatise. Ici, meme code, meme journal, et le
 * vrai cout par decision.
 *
 * La cle publique suffit : les politiques RLS autorisent la lecture. Elle se
 * passe par l'environnement et n'est jamais ecrite dans le depot.
 */
const GAME_ID = process.env.GAME_ID
const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_KEY

async function rest(path: string) {
    const res = await fetch(`${URL_}/rest/v1/${path}`, {
        headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` },
    })
    if (!res.ok) throw new Error(`${res.status} sur ${path}`)
    return res.json()
}

describe.skipIf(!GAME_ID || !URL_ || !KEY)('review d une partie reelle', () => {
    it('analyse chaque joueur sans erreur et produit des verdicts coherents', async () => {
        const [players, games, events] = await Promise.all([
            rest(`game_players?game_id=eq.${GAME_ID}&select=player_id,player_name,seat&order=seat.asc`),
            rest(`games?id=eq.${GAME_ID}&select=grid_id`),
            rest(`game_events?game_id=eq.${GAME_ID}&select=event_type,payload&order=created_at.asc`),
        ])
        expect(events.length).toBeGreaterThan(0)

        const gridId = String(games[0]?.grid_id ?? '01').replace(/^grid-/, '')
        const roster = players.map((p: any) => ({ id: p.player_id, name: p.player_name }))
        const W: WeightsV3 = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
        const bot = makeGreedyV3Bot(W, 'v3-multi')

        const fresh = () => {
            setActivePinia(createPinia())
            const store = useGameStore()
            store.initPlayers(roster)
            store.initGrid(gridId)
            return store
        }

        // Invariant de rejeu sur la partie ENTIERE, pas seulement deux tours.
        const decisions = replayDecisions(fresh(), events as GameEvent[])
        const played = decisions.filter(d => d.played)
        const missing = played.filter(d => !d.candidates.some(c => sameMove(c, d.played)))
        console.log(`\n  ${events.length} evenements, ${decisions.length} decisions, `
            + `${played.length} coups joues, ${missing.length} introuvables parmi les coups legaux`)
        expect(missing).toHaveLength(0)

        for (const p of roster) {
            const started = Date.now()
            const review = reviewGame(fresh(), events as GameEvent[], { rolloutBot: bot, playerId: p.id })
            const ms = Date.now() - started
            const s = review.summary
            console.log(
                `\n  ${p.name} : ${s.decisions} decisions en ${(ms / 1000).toFixed(1)} s `
                + `(${s.decisions ? (ms / s.decisions / 1000).toFixed(2) : '0'} s/decision)`
                + `\n    defendables ${s.good}, erreurs ${s.erreurs}, fautes ${s.fautes}, `
                + `ecart reproche ${s.totalLoss.toFixed(2)} pts`,
            )
            for (const m of review.moves) {
                const what = m.played ? `${m.played.color}x${m.played.placement.length}` : 'passe'
                console.log(
                    `    T${String(m.turn + 1).padStart(2)} ${what.padEnd(6)} ${m.verdict.padEnd(9)} `
                    + `ecart ${m.loss.toFixed(2).padStart(5)} +/- ${m.loss95.toFixed(2)}  `
                    + `defendables ${m.goodMoves.length}/${m.evaluated}`,
                )
                // Coherence : on ne reproche jamais un coup du groupe defendable.
                if (m.playedWasGood) expect(['excellent', 'bon']).toContain(m.verdict)
                expect(Number.isFinite(m.loss)).toBe(true)
            }
            expect(s.decisions).toBe(decisions.filter(d => d.playerId === p.id).length)
        }
    }, 30 * 60_000)
})
