import { makeRng } from '../engine/dice'
import { applyMove, cloneSheet } from '../engine/state'
import type { Move, Sheet } from '../engine/state'
import type { Cells, ColorKey } from '../engine/types'
import { continueMultiGame } from '../bots/playMulti'
import type { MultiPlayerState } from '../bots/playMulti'
import type { Bot } from '../bots/types'

/**
 * Ce que vaut un coup, mesure en deroulant la suite de la partie.
 *
 * Pourquoi un deroulement multijoueur et pas mono-agent : le protocole de
 * mesure du projet a etabli qu'un cadrage solitaire ne punit pas la
 * temporisation, parce que l'agent y decide seul de la fin. Il avait classe le
 * champion solitaire DERNIER a une table de 4. Juger un coup humain avec ce
 * cadrage reviendrait a lui reprocher d'etre rapide.
 */

export interface PlayerPosition {
    name: string
    sheet: Sheet
    colorBonus: Partial<Record<ColorKey, 'first' | 'others'>>
    columnBonus: Record<number, 'first' | 'others'>
}

export interface DecisionPosition {
    cells: Cells
    /** Etat de tous les joueurs au moment de la decision, dans l'ordre des sieges. */
    players: PlayerPosition[]
    /** Siege du joueur dont on juge le coup. */
    seat: number
    turn: number
    /** Coups legaux offerts par le lancer, `null` en plus si passer etait permis. */
    candidates: (Move | null)[]
    /** Le coup reellement joue, `null` si le joueur a passe. */
    played: Move | null
}

export interface MoveValue {
    move: Move | null
    /** Score final moyen du joueur analyse sur les deroulements. */
    mean: number
    /** Scores bruts, conserves pour les differences appariees. */
    samples: number[]
}

export interface DecisionAnalysis {
    turn: number
    seat: number
    best: MoveValue
    played: MoveValue
    /** Perte estimee : moyenne des ecarts APPARIES (meilleur - joue). */
    loss: number
    /** Erreur type de cette moyenne appariee. */
    lossStderr: number
    /** Demi-largeur de l'intervalle a 95 %. */
    loss95: number
    /**
     * Vrai seulement si l'intervalle exclut zero. Un coup dont l'ecart tient
     * dans le bruit n'est PAS une erreur et ne doit pas etre etiquete comme
     * telle : c'est la difference entre une analyse et un gadget.
     */
    significant: boolean
    candidates: MoveValue[]
    rollouts: number
}

export interface EvaluateOptions {
    /** Deroulements par candidat. Le cout est lineaire, la precision en 1/sqrt. */
    rollouts?: number
    /** Candidats retenus apres preselection. Borne le cout sans changer le verdict. */
    topK?: number
    /** Politique jouee pendant les deroulements, par tous les joueurs. */
    rolloutBot: Bot
    /** Classement de preselection ; typiquement l'heuristique du bot. */
    rank?: (move: Move | null) => number
    seed?: number
    maxTurns?: number
    totalJokers?: number
    /**
     * Nombre de tours deroules avant d'arreter et de compter les points comme
     * si la partie se terminait la. Omis, on deroule jusqu'a la vraie fin.
     *
     * Raison d'etre : derouler 25 tours accumule 25 tours de bruit de des, et
     * l'ecart type du score final ecrase la difference entre deux coups. Une
     * troncature courte enleve l'essentiel de ce bruit. Elle introduit un biais
     * vers le court terme, mais identique pour tous les candidats — et comme la
     * comparaison est appariee, ce biais commun ne deplace pas le classement.
     */
    horizon?: number
}

/**
 * Deroule la partie jusqu'au bout depuis la position donnee et renvoie le score
 * final du siege analyse.
 *
 * Le coup candidat est applique a la feuille du joueur, puis la partie reprend
 * au tour suivant. Les coups des adversaires pour le tour en cours ne sont donc
 * pas rejoues — un biais constant, identique pour tous les candidats, qui
 * disparait dans la difference appariee.
 */
function rolloutAfter(
    position: DecisionPosition,
    move: Move | null,
    bot: Bot,
    seed: number,
    maxTurns: number,
    totalJokers: number,
): number {
    const players: MultiPlayerState[] = position.players.map((p, i) => {
        const sheet = cloneSheet(p.sheet)
        if (i === position.seat && move) applyMove(sheet, move)
        return {
            name: p.name,
            bot,
            sheet,
            colorBonus: { ...p.colorBonus },
            columnBonus: { ...p.columnBonus },
            passes: 0,
            forcedPasses: 0,
        }
    })

    const result = continueMultiGame(
        position.cells, players, makeRng(seed), position.turn + 1, { maxTurns, totalJokers },
    )
    return result.scores[position.seat]
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export function evaluateDecision(
    position: DecisionPosition,
    opts: EvaluateOptions,
): DecisionAnalysis {
    const rollouts = opts.rollouts ?? 24
    const topK = opts.topK ?? 6
    const totalJokers = opts.totalJokers ?? 8
    const baseSeed = opts.seed ?? 20260912
    const maxTurns = opts.horizon !== undefined
        ? Math.min(opts.maxTurns ?? 60, position.turn + 1 + opts.horizon)
        : (opts.maxTurns ?? 60)

    // Preselection : derouler tous les coups d'un lancer coute cher pour rien,
    // la plupart sont manifestement mauvais. Le coup JOUE est toujours conserve,
    // sinon on ne pourrait pas le comparer.
    let shortlist = position.candidates
    if (opts.rank && shortlist.length > topK) {
        const ranked = [...shortlist].sort((a, b) => opts.rank!(b) - opts.rank!(a)).slice(0, topK)
        if (!ranked.some(m => sameMove(m, position.played))) ranked.push(position.played)
        shortlist = ranked
    }

    // Les memes graines pour tous les candidats : la comparaison est appariee,
    // et le bruit des des s'annule au lieu de s'ajouter.
    const seeds = Array.from({ length: rollouts }, (_, r) => baseSeed + r * 104729)

    const values: MoveValue[] = shortlist.map(move => {
        const samples = seeds.map(seed =>
            rolloutAfter(position, move, opts.rolloutBot, seed, maxTurns, totalJokers))
        return { move, mean: mean(samples), samples }
    })

    /*
     * Selection et estimation sur des echantillons DISJOINTS.
     *
     * Choisir le meilleur candidat puis estimer sa valeur sur les memes
     * deroulements surestime systematiquement la perte : le maximum de
     * plusieurs moyennes bruitees capture le bruit favorable. Mesure faite, le
     * biais domine — la perte moyenne tombait de 3,52 a 1,34 en passant de 4 a
     * 16 deroulements, alors qu'une vraie perte ne depend pas du budget.
     *
     * La premiere moitie des graines choisit le coup, la seconde mesure l'ecart.
     * Le coup retenu est donc choisi independamment des nombres qui le jugent.
     */
    const half = Math.floor(rollouts / 2)
    const selectIdx = values[0].samples.map((_, i) => i).filter(i => i < half)
    const scoreIdx = values[0].samples.map((_, i) => i).filter(i => i >= half)
    const meanOver = (v: MoveValue, idx: number[]) => mean(idx.map(i => v.samples[i]))

    let best = values[0]
    for (const v of values) {
        if (meanOver(v, selectIdx) > meanOver(best, selectIdx)) best = v
    }

    const played = values.find(v => sameMove(v.move, position.played)) ?? best

    // Ecarts appaires sur l'echantillon d'estimation uniquement.
    const diffs = scoreIdx.map(i => best.samples[i] - played.samples[i])
    const loss = mean(diffs)
    const variance = diffs.length > 1
        ? diffs.reduce((a, d) => a + (d - loss) ** 2, 0) / (diffs.length - 1)
        : 0
    const lossStderr = Math.sqrt(variance / diffs.length)
    const loss95 = 1.96 * lossStderr

    return {
        turn: position.turn,
        seat: position.seat,
        best,
        played,
        loss,
        lossStderr,
        loss95,
        significant: loss - loss95 > 0,
        candidates: values,
        rollouts,
    }
}

export function sameMove(a: Move | null, b: Move | null): boolean {
    if (a === null || b === null) return a === b
    if (a.color !== b.color) return false
    if (a.placement.length !== b.placement.length) return false
    const x = [...a.placement].sort((p, q) => p - q)
    const y = [...b.placement].sort((p, q) => p - q)
    return x.every((v, i) => v === y[i])
}
