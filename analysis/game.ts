import type { Bot } from '../bots/types'
import { replayDecisions } from './replay'
import type { GameEvent, ReplayedDecision } from './replay'
import { DEFAULT_BANDS, DEFAULT_HORIZON, analyseDecision } from './verdict'
import type { DecisionVerdict, VerdictBands } from './verdict'

export interface ReviewedMove extends DecisionVerdict {
    playerId: string
    playerName: string
    /**
     * Cases deja cochees par le joueur AVANT ce coup. Sans elles, la page ne
     * peut montrer que le coup sur une grille vide, et un coup ne se comprend
     * pas sans sa position.
     */
    checkedBefore: number[]
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
 * Compter 3 a 5 secondes par decision au reglage par defaut (4,2 s en moyenne,
 * mesure sur une partie reelle complete), soit une a deux minutes pour une
 * partie. Assez long pour meriter une barre de progression : dans le navigateur,
 * passer par `reviewGameAsync`, qui rend la main entre les decisions.
 *
 * Le store passe ici doit etre NEUF — joueurs et grille initialises, aucun
 * evenement applique. Il sera consomme par le rejeu.
 */
export function startReview(store: any, events: GameEvent[], opts: ReviewOptions) {
    const decisions = replayDecisions(store, events)
    const mine = decisions.filter((d: ReplayedDecision) => d.playerId === opts.playerId)
    const moves: ReviewedMove[] = []

    return {
        total: mine.length,
        /** Analyse la decision `i`. Un pas dure 3 a 5 secondes selon le nombre de candidats. */
        step(i: number) {
            const d = mine[i]
            const verdict = analyseDecision(d, {
                rolloutBot: opts.rolloutBot,
                rollouts: opts.rollouts ?? 32,
                screenRollouts: opts.screenRollouts ?? 8,
                shortlist: opts.shortlist ?? 8,
                horizon: opts.horizon ?? DEFAULT_HORIZON,
                bands: opts.bands ?? DEFAULT_BANDS,
                seed: opts.seed,
            })

            const mask = d.players[d.seat].sheet.mask
            const checkedBefore: number[] = []
            for (let c = 0; c < mask.length; c++) if (mask[c]) checkedBefore.push(c)

            moves.push({ ...verdict, playerId: d.playerId, playerName: d.playerName, checkedBefore })
            opts.onProgress?.(i + 1, mine.length)
        },
        finish: () => summarise(mine[0]?.playerName ?? '', opts.playerId, moves),
    }
}

/** Version bloquante, pour les scripts Node. */
export function reviewGame(store: any, events: GameEvent[], opts: ReviewOptions): GameReview {
    const run = startReview(store, events, opts)
    for (let i = 0; i < run.total; i++) run.step(i)
    return run.finish()
}

/**
 * Rend la main au navigateur, le temps qu'il redessine et traite les evenements.
 *
 * `setTimeout(0)` ne convient pas : dans un onglet en arriere-plan, Chrome bride
 * les minuteries a une seconde et plus, si bien qu'une analyse lancee puis
 * laissee de cote en changeant d'onglet devenait plusieurs fois plus lente. Un
 * message sur un MessageChannel est une tache ordinaire, que ce bridage ne
 * touche pas.
 */
function yieldToBrowser(): Promise<void> {
    return new Promise(resolve => {
        if (typeof MessageChannel === 'undefined') {
            setTimeout(resolve, 0)
            return
        }
        const { port1, port2 } = new MessageChannel()
        port1.onmessage = () => {
            port1.close()
            resolve()
        }
        port2.postMessage(null)
    })
}

/**
 * Version pour le navigateur : rend la main entre chaque decision.
 *
 * Sans cette respiration, une analyse d'une a deux minutes monopolise le fil
 * principal — la barre de progression ne se redessine jamais et Chrome finit par
 * proposer de tuer la page. Ce n'est pas un worker, la page reste donc
 * inutilisable pendant le calcul ; mais elle reste vivante et affiche ou elle en
 * est.
 */
export async function reviewGameAsync(
    store: any,
    events: GameEvent[],
    opts: ReviewOptions,
): Promise<GameReview> {
    const run = startReview(store, events, opts)
    for (let i = 0; i < run.total; i++) {
        run.step(i)
        await yieldToBrowser()
    }
    return run.finish()
}

function summarise(playerName: string, playerId: string, moves: ReviewedMove[]): GameReview {
    const erreurs = moves.filter(m => m.verdict === 'erreur').length
    const fautes = moves.filter(m => m.verdict === 'faute').length
    const good = moves.filter(m => m.playedWasGood).length

    return {
        playerId,
        playerName,
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
