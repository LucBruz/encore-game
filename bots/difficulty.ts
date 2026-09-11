import type { Move } from '../engine/state'
import type { Bot, TurnContext } from './types'

/** Donne la valeur de chaque coup candidat, sans choisir. */
export type MoveScorer = (ctx: TurnContext) => { move: Move; value: number }[]

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
            const scored = scorer(ctx)
            if (scored.length === 0) return null
            if (scored.length === 1) return scored[0].move

            // Temperature nulle : politique deterministe, on prend le meilleur.
            if (temperature <= 0) {
                let best = scored[0]
                for (const s of scored) if (s.value > best.value) best = s
                return best.move
            }

            const values = scored.map(s => s.value)
            const mean = values.reduce((a, b) => a + b, 0) / values.length
            const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
            const sd = Math.sqrt(variance)

            // Tous les coups se valent : autant tirer uniformement.
            if (sd < 1e-9) return scored[Math.floor(ctx.rng() * scored.length)].move

            // Soustraction du max avant exp : evite un depassement sur les grands z.
            const logits = values.map(v => (v - mean) / sd / temperature)
            const maxLogit = Math.max(...logits)
            const weights = logits.map(l => Math.exp(l - maxLogit))
            const total = weights.reduce((a, b) => a + b, 0)

            let r = ctx.rng() * total
            for (let i = 0; i < scored.length; i++) {
                r -= weights[i]
                if (r <= 0) return scored[i].move
            }
            return scored[scored.length - 1].move
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
