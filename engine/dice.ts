import type { ColorKey } from './types'

export type ColorFace = ColorKey | 'joker'
export type NumberFace = 1 | 2 | 3 | 4 | 5 | 'joker'

export const COLOR_FACES: readonly ColorFace[] = ['g', 'y', 'b', 'p', 'o', 'joker']
export const NUMBER_FACES: readonly NumberFace[] = [1, 2, 3, 4, 5, 'joker']

export const DICE_PER_KIND = 3

export interface Roll {
    colors: ColorFace[]
    numbers: NumberFace[]
}

export type Rng = () => number

export function rollDice(rng: Rng): Roll {
    const colors: ColorFace[] = []
    const numbers: NumberFace[] = []
    for (let i = 0; i < DICE_PER_KIND; i++) {
        colors.push(COLOR_FACES[Math.floor(rng() * COLOR_FACES.length)])
        numbers.push(NUMBER_FACES[Math.floor(rng() * NUMBER_FACES.length)])
    }
    return { colors, numbers }
}

/**
 * Classes de lancer : seul le multi-ensemble des faces compte, pas l'ordre des des.
 * 3 des parmi 6 faces = C(8,3) = 56 classes par type, soit 56 x 56 = 3136 lancers
 * distincts au lieu de 6^6 = 46656. C'est ce qui rend un noeud de hasard
 * exhaustif praticable pour l'expectimax.
 */
export interface FaceClass<T> {
    faces: T[]
    /** Probabilite de ce multi-ensemble sur un jet de 3 des a 6 faces. */
    probability: number
}

function multisetsOf<T>(faces: readonly T[], k: number): T[][] {
    const out: T[][] = []
    const cur: T[] = []
    const walk = (start: number) => {
        if (cur.length === k) { out.push([...cur]); return }
        for (let i = start; i < faces.length; i++) {
            cur.push(faces[i])
            walk(i) // i, pas i+1 : repetitions autorisees
            cur.pop()
        }
    }
    walk(0)
    return out
}

/** Nombre d'arrangements distincts d'un multi-ensemble = k! / prod(multiplicites!). */
function permutationCount<T>(multiset: T[]): number {
    const counts = new Map<T, number>()
    for (const f of multiset) counts.set(f, (counts.get(f) ?? 0) + 1)
    let num = 1
    for (let i = 2; i <= multiset.length; i++) num *= i
    for (const c of counts.values()) {
        let fac = 1
        for (let i = 2; i <= c; i++) fac *= i
        num /= fac
    }
    return num
}

function buildClasses<T>(faces: readonly T[], k: number): FaceClass<T>[] {
    const total = Math.pow(faces.length, k)
    return multisetsOf(faces, k).map(ms => ({
        faces: ms,
        probability: permutationCount(ms) / total,
    }))
}

let colorClassCache: FaceClass<ColorFace>[] | null = null
let numberClassCache: FaceClass<NumberFace>[] | null = null

export function colorRollClasses(): FaceClass<ColorFace>[] {
    colorClassCache ??= buildClasses(COLOR_FACES, DICE_PER_KIND)
    return colorClassCache
}

export function numberRollClasses(): FaceClass<NumberFace>[] {
    numberClassCache ??= buildClasses(NUMBER_FACES, DICE_PER_KIND)
    return numberClassCache
}

/** PRNG deterministe (mulberry32). */
export function makeRng(seed: number): Rng {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
