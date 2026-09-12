import type { Move } from '../engine/state'
import type { Bot } from '../bots/types'
import {
    evaluateCandidates, mean, sameMove, stderrOf,
} from './evaluate'
import type { DecisionPosition, MoveValue } from './evaluate'

/**
 * Verdict sur un coup joue.
 *
 * Le vocabulaire suit ce que la mesure permet d'affirmer, et rien de plus.
 * Mesure faite sur de vraies decisions : l'etendue entre le meilleur et le pire
 * coup d'une position vaut en moyenne 3,49 points pour un bruit de 0,35, soit
 * un rapport de 10. Le haut du classement se separe donc nettement du bas —
 * mais environ QUATRE coups par decision sont statistiquement indiscernables du
 * meilleur.
 *
 * D'ou la regle : on ne couronne pas un meilleur coup unique. On distingue un
 * groupe de coups defendables, puis des ecarts qui deviennent affirmables a
 * mesure qu'on descend.
 */
export type Verdict = 'excellent' | 'bon' | 'imprecision' | 'erreur' | 'faute'

export interface VerdictBands {
    /** Perte au-dela de laquelle un coup cesse d'etre une simple imprecision. */
    erreur: number
    /** Perte au-dela de laquelle on parle de faute. */
    faute: number
}

/** Provisoire : a remplacer par la distribution mesuree (scripts/analyse-bands.ts). */
export const DEFAULT_BANDS: VerdictBands = { erreur: 1.5, faute: 3 }

export interface DecisionVerdict {
    turn: number
    seat: number
    played: Move | null
    verdict: Verdict
    /** Ecart au meilleur coup, en points, estime sans biais de selection. */
    loss: number
    /** Demi-largeur de l'intervalle a 95 % sur cet ecart. */
    loss95: number
    /** Vrai si l'intervalle exclut zero : sans cela, aucun reproche n'est fonde. */
    significant: boolean
    /** Coups indiscernables du meilleur — il y en a presque toujours plusieurs. */
    goodMoves: (Move | null)[]
    /** Le coup joue faisait-il partie de ce groupe ? */
    playedWasGood: boolean
    /** Meilleur coup retenu, a titre de suggestion et non de verite. */
    suggestion: Move | null
    /** Meilleur moins pire parmi les coups evalues au second tour. */
    spread: number
    legalMoves: number
    evaluated: number
}

export interface AnalyseOptions {
    rolloutBot: Bot
    /** Deroulements de la passe de criblage, sur TOUS les coups legaux. */
    screenRollouts?: number
    /** Coups retenus pour la passe de verdict. */
    shortlist?: number
    /** Deroulements de la passe de verdict. */
    rollouts?: number
    horizon?: number
    seed?: number
    maxTurns?: number
    totalJokers?: number
    bands?: VerdictBands
}

/**
 * Deux passes, parce qu'evaluer tous les coups au budget complet coute environ
 * six secondes par decision — trois minutes pour une partie.
 *
 * Passe 1, bon marche, sur tous les coups legaux : elle ne sert qu'a designer
 * les pretendants. Passe 2, budget complet et GRAINES DIFFERENTES, sur ces
 * pretendants plus le coup reellement joue, qui est le seul que le verdict
 * concerne.
 *
 * Si le criblage ecarte a tort un tres bon coup, le meilleur retenu est alors
 * moins bon, donc l'ecart impute au joueur est plus PETIT. L'erreur de criblage
 * rend le verdict plus indulgent, jamais plus severe — c'est le sens dans
 * lequel on veut se tromper quand on reproche un coup a quelqu'un.
 */
export function analyseDecision(
    position: DecisionPosition,
    opts: AnalyseOptions,
): DecisionVerdict {
    const screenRollouts = opts.screenRollouts ?? 8
    const shortlistSize = opts.shortlist ?? 8
    const rollouts = opts.rollouts ?? 32
    const seed = opts.seed ?? 20260912
    const bands = opts.bands ?? DEFAULT_BANDS
    const shared = {
        rolloutBot: opts.rolloutBot,
        horizon: opts.horizon,
        maxTurns: opts.maxTurns,
        totalJokers: opts.totalJokers,
    }

    // ── Passe 1 : criblage ───────────────────────────────────────────────────
    const screened = evaluateCandidates(position, position.candidates, {
        ...shared, rollouts: screenRollouts, seed,
    })
    const contenders = [...screened]
        .sort((a, b) => b.mean - a.mean)
        .slice(0, shortlistSize)
        .map(v => v.move)
    if (!contenders.some(m => sameMove(m, position.played))) contenders.push(position.played)

    // ── Passe 2 : verdict, graines disjointes de la passe 1 ──────────────────
    const finals = evaluateCandidates(position, contenders, {
        ...shared, rollouts, seed: seed + 777_777,
    })

    // Selection et estimation sur des moities disjointes : choisir le meilleur
    // puis le juger sur les memes nombres surestime l'ecart.
    const half = Math.floor(rollouts / 2)
    const selectIdx = finals[0].samples.map((_, i) => i).filter(i => i < half)
    const scoreIdx = finals[0].samples.map((_, i) => i).filter(i => i >= half)
    const over = (v: MoveValue, idx: number[]) => mean(idx.map(i => v.samples[i]))

    let best = finals[0]
    for (const v of finals) if (over(v, selectIdx) > over(best, selectIdx)) best = v

    const played = finals.find(v => sameMove(v.move, position.played)) ?? best

    const diffsTo = (v: MoveValue) => scoreIdx.map(i => best.samples[i] - v.samples[i])
    const playedDiffs = diffsTo(played)
    const loss = mean(playedDiffs)
    const loss95 = 1.96 * stderrOf(playedDiffs)
    const significant = loss - loss95 > 0

    // Le groupe des coups defendables : ceux dont l'ecart au meilleur ne sort
    // pas du bruit. Il en contient presque toujours plusieurs.
    const goodMoves = finals
        .filter(v => {
            const d = diffsTo(v)
            return mean(d) - 1.96 * stderrOf(d) <= 0
        })
        .map(v => v.move)

    const scores = finals.map(v => over(v, scoreIdx))
    const spread = Math.max(...scores) - Math.min(...scores)

    let verdict: Verdict
    if (!significant) verdict = sameMove(played.move, best.move) ? 'excellent' : 'bon'
    else if (loss >= bands.faute) verdict = 'faute'
    else if (loss >= bands.erreur) verdict = 'erreur'
    else verdict = 'imprecision'

    return {
        turn: position.turn,
        seat: position.seat,
        played: position.played,
        verdict,
        loss,
        loss95,
        significant,
        goodMoves,
        playedWasGood: goodMoves.some(m => sameMove(m, position.played)),
        suggestion: best.move,
        spread,
        legalMoves: position.candidates.length,
        evaluated: finals.length,
    }
}
