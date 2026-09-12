import type { Bot } from '../bots/types'
import { replayDecisions } from './replay'
import type { GameEvent, ReplayedDecision } from './replay'
import { DEFAULT_BANDS, DEFAULT_HORIZON, analyseDecision } from './verdict'
import type { DecisionVerdict, VerdictBands } from './verdict'

export interface ReviewedMove extends DecisionVerdict {
    playerId: string
    playerName: string
}

export interface GameReview {
    playerId: string
    playerName: string
    moves: ReviewedMove[]
    summary: {
        decisions: number
        /** Coups appartenant au groupe des coups defendables. */
        good: number
        erreurs: number
        fautes: number
        /** Part des decisions sur lesquelles l'outil n'a rien a reprocher. */
        cleanRate: number
        /** Somme des ecarts reproches, en points. */
        totalLoss: number
    }
}

export interface ReviewOptions {
    rolloutBot: Bot
    playerId: string
    rollouts?: number
    screenRollouts?: number
    shortlist?: number
    horizon?: number
    bands?: VerdictBands
    seed?: number
    onProgress?: (done: number, total: number) => void
}

/**
 * Analyse les coups d'UN joueur sur une partie entiere.
 *
 * Un seul joueur, parce que le cout est lineaire en decisions et qu'une review
 * s'adresse a quelqu'un en particulier : analyser les trois adversaires
 * triplerait l'attente pour rien.
 *
 * Compter environ 3,4 secondes par decision au reglage par defaut, soit une a
 * deux minutes pour une partie. C'est assez long pour meriter une barre de
 * progression, et assez long pour qu'un appel depuis le navigateur gagne a
 * partir dans un worker plutot que de figer l'interface.
 *
 * Le store passe ici doit etre NEUF — joueurs et grille initialises, aucun
 * evenement applique. Il sera consomme par le rejeu.
 */
export function reviewGame(
    store: any,
    events: GameEvent[],
    opts: ReviewOptions,
): GameReview {
    const decisions = replayDecisions(store, events)
    const mine = decisions.filter((d: ReplayedDecision) => d.playerId === opts.playerId)

    const moves: ReviewedMove[] = []
    mine.forEach((d, i) => {
        const verdict = analyseDecision(d, {
            rolloutBot: opts.rolloutBot,
            rollouts: opts.rollouts ?? 32,
            screenRollouts: opts.screenRollouts ?? 8,
            shortlist: opts.shortlist ?? 8,
            horizon: opts.horizon ?? DEFAULT_HORIZON,
            bands: opts.bands ?? DEFAULT_BANDS,
            seed: opts.seed,
        })
        moves.push({ ...verdict, playerId: d.playerId, playerName: d.playerName })
        opts.onProgress?.(i + 1, mine.length)
    })

    const erreurs = moves.filter(m => m.verdict === 'erreur').length
    const fautes = moves.filter(m => m.verdict === 'faute').length
    const good = moves.filter(m => m.playedWasGood).length

    return {
        playerId: opts.playerId,
        playerName: mine[0]?.playerName ?? '',
        moves,
        summary: {
            decisions: moves.length,
            good,
            erreurs,
            fautes,
            cleanRate: moves.length ? (moves.length - erreurs - fautes) / moves.length : 1,
            // Seuls les ecarts reproches sont comptes. Additionner les ecarts
            // non significatifs reviendrait a sommer du bruit, et produirait un
            // total d'autant plus lourd que la partie a ete longue.
            totalLoss: moves
                .filter(m => m.verdict === 'erreur' || m.verdict === 'faute')
                .reduce((a, m) => a + m.loss, 0),
        },
    }
}
