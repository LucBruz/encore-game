import type { Move } from '../engine/state'
import type { Bot, TurnContext } from './types'

export interface ScoredMoves {
    moves: { move: Move; value: number }[]
    /**
     * Valeur de la feuille si le joueur PASSE. La regle l'autorise explicitement,
     * et c'est parfois le meilleur coup.
     *
     * Mesure : dans 11 % des tours le meilleur placement disponible fait BAISSER
     * l'evaluation, et dans 97 % de ces cas c'est parce que le seul coup legal
     * depense un joker — dont le prix appris depasse le gain positionnel du coup.
     * En ne regardant que les coups sans joker, le phenomene tombe a 0,4 %.
     * Ignorer le passe volontaire coutait 1,51 point par partie.
     */
    passValue: number
}

/** Donne la valeur de chaque coup candidat et celle du passe, sans choisir. */
export type MoveScorer = (ctx: TurnContext) => ScoredMoves

/**
 * Degradation controlee d'une politique, par temperature.
 *
 * Pourquoi pas eps-greedy (jouer au hasard avec probabilite eps) : il produit des
 * BOURDES. Le bot joue parfaitement puis pose cinq croix n'importe ou. Un humain
 * faible ne fait pas ca — il joue un coup correct mais pas le meilleur. Le softmax
 * reproduit ca : plus la temperature monte, plus il pioche dans le haut du
 * classement au lieu de prendre systematiquement le premier.
 *
 * Pourquoi le z-score par decision : l'ecart de valeur entre candidats change
 * enormement selon la position et la grille. Sur une valeur brute, une meme
 * temperature serait quasi deterministe en debut de partie et quasi aleatoire en
 * fin. Normaliser rend la temperature comparable d'un bout a l'autre.
 */
export function makeTemperedBot(scorer: MoveScorer, temperature: number, name: string): Bot {
    return {
        name,
        chooseMove(ctx: TurnContext): Move | null {
            const { moves: scored, passValue } = scorer(ctx)
            if (scored.length === 0) return null

            // "Passer" entre dans le classement comme n'importe quel candidat.
            const candidates: { move: Move | null; value: number }[] = [
                ...scored,
                { move: null, value: passValue },
            ]

            // Temperature nulle : politique deterministe, on prend le meilleur.
            if (temperature <= 0) {
                let best = candidates[0]
                for (const c of candidates) if (c.value > best.value) best = c
                return best.move
            }

            const values = candidates.map(c => c.value)
            const mean = values.reduce((a, b) => a + b, 0) / values.length
            const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
            const sd = Math.sqrt(variance)

            // Tous les coups se valent : autant tirer uniformement.
            if (sd < 1e-9) return candidates[Math.floor(ctx.rng() * candidates.length)].move

            // Soustraction du max avant exp : evite un depassement sur les grands z.
            const logits = values.map(v => (v - mean) / sd / temperature)
            const maxLogit = Math.max(...logits)
            const weights = logits.map(l => Math.exp(l - maxLogit))
            const total = weights.reduce((a, b) => a + b, 0)

            let r = ctx.rng() * total
            for (let i = 0; i < candidates.length; i++) {
                r -= weights[i]
                if (r <= 0) return candidates[i].move
            }
            return candidates[candidates.length - 1].move
        },
    }
}

export interface DifficultyLevel {
    id: 'easy' | 'medium' | 'hard'
    label: string
    temperature: number
}

/**
 * Temperatures calibrees par mesure (scripts/calibrate.ts), pas au jugé.
 * `hard` est la politique brute.
 */
export const DIFFICULTY_LEVELS: DifficultyLevel[] = [
    { id: 'easy', label: 'Facile', temperature: 1.2 },
    { id: 'medium', label: 'Moyen', temperature: 0.35 },
    { id: 'hard', label: 'Difficile', temperature: 0 },
]
