import { isBotId } from '~/utils/botIdentity'

export interface ReviewPlayer {
    id: string
    name: string
}

export interface ReviewTarget {
    /** Joueurs proposables : les humains uniquement. */
    choices: ReviewPlayer[]
    /** Joueur dont on analyse la partie, ou `null` s'il reste a choisir. */
    target: string | null
    /** Vrai quand il n'y a rien a choisir. */
    locked: boolean
    /**
     * Vrai seulement si c'est la partie de la personne qui regarde. Distinct de
     * `locked` : une table avec un seul humain verrouille aussi le choix, mais
     * pour quelqu'un qui ouvre un lien partage, ce n'est pas « sa » partie.
     */
    isOwn: boolean
}

/**
 * Quel joueur analyser.
 *
 * L'analyse sert a un joueur a comprendre SA partie. On n'analyse donc jamais un
 * bot, et on ne fait rien choisir a quelqu'un qui ouvre l'analyse de sa propre
 * partie : c'est lui.
 *
 * Il ne reste un choix que si la personne n'a pas joue cette partie — par
 * exemple en ouvrant un lien partage — et que plusieurs humains y ont joue.
 */
export function pickReviewTarget(
    players: ReviewPlayer[],
    localPlayerId?: string | null,
): ReviewTarget {
    const choices = players.filter(p => !isBotId(p.id))

    if (localPlayerId && choices.some(p => p.id === localPlayerId)) {
        return { choices, target: localPlayerId, locked: true, isOwn: true }
    }
    if (choices.length === 1) {
        return { choices, target: choices[0].id, locked: true, isOwn: false }
    }
    return { choices, target: null, locked: false, isOwn: false }
}

/**
 * Coup affiche a la fin de l'analyse : la premiere erreur s'il y en a une, sinon
 * le premier coup. Le joueur ouvre l'analyse pour comprendre ce qu'il a mal
 * fait ; le faire commencer au tour 1 l'obligerait a chercher.
 */
export function initialMoveIndex(moves: { verdict: string }[]): number {
    const first = moves.findIndex(m => m.verdict === 'erreur' || m.verdict === 'faute')
    return first === -1 ? 0 : first
}
