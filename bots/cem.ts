import { makeRng } from '../engine/dice'
import type { Rng } from '../engine/dice'

export interface CemOptions {
    iterations: number
    population: number
    elites: number
    /** Bornes par parametre : la distribution est reprojetee dedans a chaque tirage. */
    bounds: [number, number][]
    seed?: number
    /** Ecart-type plancher, en fraction de l'amplitude. Evite l'effondrement premature. */
    sigmaFloor?: number
    onIteration?: (info: { iter: number; best: number; eliteMean: number; mu: number[] }) => void
}

export interface CemResult {
    mu: number[]
    history: { iter: number; best: number; eliteMean: number }[]
}

function gaussian(rng: Rng): number {
    let u = 0, v = 0
    while (u === 0) u = rng()
    while (v === 0) v = rng()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function clampToBounds(vec: number[], bounds: [number, number][]): number[] {
    return vec.map((x, i) => Math.min(bounds[i][1], Math.max(bounds[i][0], x)))
}

/**
 * Methode d'entropie croisee : echantillonner une gaussienne, garder les meilleurs,
 * refitter la gaussienne sur eux. Simple, sans gradient, robuste au bruit
 * d'evaluation — ce qui compte ici, car chaque score est une moyenne bruitee.
 */
export function runCem(
    start: number[],
    evaluate: (vec: number[]) => number,
    opts: CemOptions,
): CemResult {
    const rng = makeRng(opts.seed ?? 20260911)
    const sigmaFloor = opts.sigmaFloor ?? 0.02

    let mu = clampToBounds(start, opts.bounds)
    let sigma = opts.bounds.map(([lo, hi]) => (hi - lo) / 4)

    const history: CemResult['history'] = []

    for (let iter = 0; iter < opts.iterations; iter++) {
        const candidates: { vec: number[]; score: number }[] = []
        for (let p = 0; p < opts.population; p++) {
            const vec = clampToBounds(mu.map((m, i) => m + sigma[i] * gaussian(rng)), opts.bounds)
            candidates.push({ vec, score: evaluate(vec) })
        }

        candidates.sort((a, b) => b.score - a.score)
        const elites = candidates.slice(0, opts.elites)

        mu = mu.map((_, i) => elites.reduce((s, e) => s + e.vec[i], 0) / elites.length)
        sigma = mu.map((_, i) => {
            const variance = elites.reduce((s, e) => s + (e.vec[i] - mu[i]) ** 2, 0) / elites.length
            const span = opts.bounds[i][1] - opts.bounds[i][0]
            return Math.max(Math.sqrt(variance), span * sigmaFloor)
        })

        const eliteMean = elites.reduce((s, e) => s + e.score, 0) / elites.length
        history.push({ iter, best: +candidates[0].score.toFixed(2), eliteMean: +eliteMean.toFixed(2) })
        opts.onIteration?.({ iter, best: candidates[0].score, eliteMean, mu })
    }

    return { mu, history }
}
