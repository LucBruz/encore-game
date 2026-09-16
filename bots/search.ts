import { makeRng } from '../engine/dice'
import { applyMove, cloneSheet } from '../engine/state'
import type { Move } from '../engine/state'
import { continueMultiGame, removeChosenDice } from './playMulti'
import type { MultiPlayerState } from './playMulti'
import type { Bot, TurnContext } from './types'
import { gridInfo, opponentCounts, summarizeOpponents } from './valueFeatures'
import { ValueNetEvaluator, bestOf, makeMoveRanker, makeValueNetBot } from './valueNet'
import type { ValueNet } from './valueNet'

export interface SearchOptions {
    /** Candidats simules : les meilleurs selon le reseau (et le deni s'il est actif). */
    topK?: number
    /** Simulations par candidat, avec les MEMES des d'un candidat a l'autre. */
    rollouts?: number
    /** Tours simules apres le tour en cours, avant de laisser le reseau estimer la fin. */
    horizon?: number
    /** Deni de des applique a la preselection (0 = aucun). */
    denialWeight?: number
    /** Politique des adversaires pendant les simulations. */
    opponentBot: Bot
    seed?: number
    name?: string
}

/**
 * Recherche au moment de jouer : pour chaque candidat retenu par le reseau, simule
 * la suite de la partie quelques tours — le reseau a sa place, `opponentBot` aux
 * autres, le reste du tour en cours compris — puis laisse le reseau estimer la marge
 * finale de la position atteinte (ou prend la vraie marge si la partie s'est finie).
 * Le coup de meilleure moyenne est joue.
 *
 * Deux regles apprises plus tot dans ce projet :
 *   - la suite est jouee par la politique qui jouera vraiment (le reseau), sinon on
 *     note les positions pour un autre joueur ;
 *   - tous les candidats voient les memes des (graines communes), sinon le bruit des
 *     des ecrase l'ecart entre deux coups.
 *
 * Les simulations tirent leurs des d'un generateur PROPRE au bot : `ctx.rng` est
 * celui de la partie, et y puiser changerait les des reels.
 */
export function makeSearchBot(net: ValueNet, opts: SearchOptions): Bot {
    const topK = opts.topK ?? 4
    const rollouts = opts.rollouts ?? 16
    const horizon = opts.horizon ?? 4
    const denialWeight = opts.denialWeight ?? 0
    const seedBase = opts.seed ?? 9_100_000
    const rank = makeMoveRanker(net, 'margin')
    const self = makeValueNetBot(net, 'reseau', 'margin')
    const evaluator = new ValueNetEvaluator(net)
    const marginIndex = net.heads.indexOf('margin')
    let decisions = 0

    function simulate(ctx: TurnContext, move: Move | null, seed: number): number {
        const { cells, turn, totalJokers, fullRoll, table } = ctx
        const { seat, players } = table!
        const n = players.length
        const simultaneous = turn < 3
        const active = turn % n
        const isActive = !simultaneous && seat === active
        const played = simultaneous
            ? seat + 1
            : isActive ? 1 : 2 + players.map((_, i) => i).filter(i => i !== active && i < seat).length

        const state: MultiPlayerState[] = players.map((p, i) => {
            const sheet = cloneSheet(p.sheet)
            if (i === seat && move) applyMove(sheet, move)
            return {
                name: '', bot: i === seat ? self : opts.opponentBot, sheet,
                colorBonus: { ...p.colorBonus }, columnBonus: { ...p.columnBonus }, passes: 0, forcedPasses: 0,
            }
        })
        const r = continueMultiGame(cells, state, makeRng(seed), turn, {
            maxTurns: turn + 1 + horizon,
            totalJokers,
            resume: {
                roll: fullRoll!,
                played,
                poolForPassives: isActive && move ? removeChosenDice(fullRoll!, move) : fullRoll!,
            },
        })
        if (r.endedNaturally) {
            let bestOther = -Infinity
            r.scores.forEach((s, i) => { if (i !== seat) bestOther = Math.max(bestOther, s) })
            return r.scores[seat] - bestOther
        }
        const last = r.turns - 1
        const info = gridInfo(cells)
        const others = state.filter((_, i) => i !== seat).map(p => p.sheet.mask)
        const me = state[seat].sheet
        return evaluator.evaluate(
            info, me.mask, me.jokersUsed, opponentCounts(others), summarizeOpponents(info, others),
            last, last >= 3 && seat === last % n, totalJokers,
        )[marginIndex]
    }

    return {
        name: opts.name ?? `recherche-k${topK}-r${rollouts}-h${horizon}`,
        chooseMove(ctx: TurnContext): Move | null {
            if (ctx.moves.length === 0) return null
            const scored = rank(ctx, denialWeight)
            if (!ctx.table || !ctx.fullRoll) return bestOf(scored)
            // Ordre stable : a valeur egale, l'ordre d'enumeration (passe d'abord).
            const shortlist = scored.map((s, i) => ({ ...s, i }))
                .sort((a, b) => b.value - a.value || a.i - b.i)
                .slice(0, topK)
            if (shortlist.length === 1) return shortlist[0].move

            const decision = decisions++
            let best = shortlist[0]
            let bestMean = -Infinity
            for (const c of shortlist) {
                let sum = 0
                for (let r = 0; r < rollouts; r++) {
                    sum += simulate(ctx, c.move, (seedBase + decision * 7919 + r * 104729) >>> 0)
                }
                const mean = sum / rollouts
                if (mean > bestMean) { bestMean = mean; best = c }
            }
            return best.move
        },
    }
}
