import type { Roll } from '../engine/dice'
import { CELL_COUNT } from '../engine/grid'
import { legalMoves, legalMovesByDicePair } from '../engine/state'
import type { Move, Sheet } from '../engine/state'
import type { CheckedMask } from '../engine/types'
import type { Bot, TurnContext } from './types'
import {
    DENSE_SIZE, SPARSE_OPPONENTS, SPARSE_SIZE, SPARSE_STAR,
    denseFeatures, gridInfo, opponentCounts, summarizeOpponents,
} from './valueFeatures'
import type { GridInfo, OpponentSummary } from './valueFeatures'

/**
 * Reseau de valeur entraine par `training/train.py`, execute en TypeScript.
 *
 * Pas de dependance d'inference : le reseau est petit, et la premiere couche se
 * somme sur les seules entrees actives. Ce fichier doit rester le miroir exact
 * de `ValueNet` et `Expander` en Python ; le test de parite le verifie sur des
 * positions et des sorties exportees par l'entrainement.
 */

interface Linear { in: number; out: number; w: Float32Array; b: Float32Array }

export interface ValueNet {
    hidden: number
    /** Poids de la premiere couche rangee par colonne : `accW[j * hidden + h]`. */
    accW: Float32Array
    accB: Float32Array
    fc1: Linear
    fc2: Linear
    out: Linear
    targetScale: number
    heads: string[]
    meta: unknown
}

const decode = (s: string): Float32Array => {
    const bytes = Buffer.from(s, 'base64')
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return new Float32Array(copy.buffer)
}

export function loadValueNet(json: any): ValueNet {
    if (json.format !== 'encore-value-net/1') throw new Error(`format de reseau inconnu : ${json.format}`)
    if (json.sparse !== SPARSE_SIZE || json.dense !== DENSE_SIZE) {
        throw new Error(`entrees ${json.sparse}+${json.dense}, le code en attend ${SPARSE_SIZE}+${DENSE_SIZE}`)
    }
    const lin = (l: any): Linear => ({ in: l.in, out: l.out, w: decode(l.w), b: decode(l.b) })
    const hidden = json.acc.out
    const rows = decode(json.acc.w) // (hidden, sparse), rangee par ligne
    const accW = new Float32Array(rows.length)
    for (let h = 0; h < hidden; h++) {
        for (let j = 0; j < SPARSE_SIZE; j++) accW[j * hidden + h] = rows[h * SPARSE_SIZE + j]
    }
    return {
        hidden, accW, accB: decode(json.acc.b),
        fc1: lin(json.fc1), fc2: lin(json.fc2), out: lin(json.out),
        targetScale: json.targetScale, heads: json.heads, meta: json.meta,
    }
}

export class ValueNetEvaluator {
    private readonly acc: Float64Array
    private readonly x1: Float64Array
    private readonly x2: Float64Array
    private readonly x3: Float64Array
    readonly result: Float64Array
    private readonly dense = new Float64Array(DENSE_SIZE)

    constructor(readonly net: ValueNet) {
        this.acc = new Float64Array(net.hidden)
        this.x1 = new Float64Array(net.hidden + DENSE_SIZE)
        this.x2 = new Float64Array(net.fc1.out)
        this.x3 = new Float64Array(net.fc2.out)
        this.result = new Float64Array(net.out.out)
    }

    private addColumn(j: number, scale: number) {
        const { accW, hidden } = this.net
        const base = j * hidden
        for (let h = 0; h < hidden; h++) this.acc[h] += accW[base + h] * scale
    }

    /**
     * Premiere couche. Miroir de `Expander` : une colonne par (case, couleur)
     * cochee, une par etoile cochee, et la part d'adversaires ayant coche la case.
     */
    accumulate(info: GridInfo, mask: CheckedMask, counts: Uint8Array, opponents: number) {
        this.acc.set(this.net.accB)
        const share = 1 / Math.max(1, opponents)
        for (let i = 0; i < CELL_COUNT; i++) {
            if (mask[i]) {
                this.addColumn(i * 5 + info.colorOf[i], 1)
                if (info.star[i]) this.addColumn(SPARSE_STAR + i, 1)
            }
            if (counts[i]) this.addColumn(SPARSE_OPPONENTS + i, counts[i] * share)
        }
    }

    /** Couches denses, a partir de l'accumulateur et d'un vecteur dense deja rempli. */
    finish(dense: ArrayLike<number>): Float64Array {
        const { hidden, fc1, fc2, out, targetScale } = this.net
        for (let h = 0; h < hidden; h++) this.x1[h] = this.acc[h] > 0 ? this.acc[h] : 0
        for (let d = 0; d < DENSE_SIZE; d++) this.x1[hidden + d] = dense[d]
        dense1(fc1, this.x1, this.x2, true)
        dense1(fc2, this.x2, this.x3, true)
        dense1(out, this.x3, this.result, false)
        for (let k = 0; k < this.result.length; k++) this.result[k] *= targetScale
        return this.result
    }

    evaluate(
        info: GridInfo, mask: CheckedMask, jokersUsed: number,
        counts: Uint8Array, summaries: OpponentSummary[],
        turn: number, isActive: boolean, totalJokers: number,
    ): Float64Array {
        this.accumulate(info, mask, counts, summaries.length)
        denseFeatures(info, mask, jokersUsed, summaries, turn, isActive, totalJokers, this.dense)
        return this.finish(this.dense)
    }
}

function dense1(layer: Linear, input: Float64Array, output: Float64Array, relu: boolean) {
    const { w, b, in: nIn, out: nOut } = layer
    for (let o = 0; o < nOut; o++) {
        let s = b[o]
        const row = o * nIn
        for (let i = 0; i < nIn; i++) s += w[row + i] * input[i]
        output[o] = relu && s < 0 ? 0 : s
    }
}

/**
 * Bot a un coup d'avance : la feuille apres chaque coup legal, et la feuille
 * inchangee pour « passer », sont notees par le reseau. Meme structure de
 * decision que `makeGreedyV3Bot`, pour que le duel ne compare que l'evaluation.
 */
export function makeValueNetBot(net: ValueNet, name = 'value-net', head: 'score' | 'margin' = 'score'): Bot {
    const evaluator = new ValueNetEvaluator(net)
    const headIndex = net.heads.indexOf(head)
    if (headIndex === -1) throw new Error(`tete inconnue : ${head}`)
    const scratch = new Uint8Array(CELL_COUNT)

    return {
        name,
        chooseMove({ cells, sheet, moves, turn, totalJokers, isActive, opponents }: TurnContext): Move | null {
            if (moves.length === 0) return null
            const info = gridInfo(cells)
            const others = (opponents ?? []).map(o => o.mask)
            const counts = opponentCounts(others)
            const summaries = summarizeOpponents(info, others)
            const active = isActive ?? false

            let best: Move | null = null
            let bestValue = evaluator.evaluate(info, sheet.mask, sheet.jokersUsed, counts, summaries, turn, active, totalJokers)[headIndex]
            for (const move of moves) {
                scratch.set(sheet.mask)
                for (const idx of move.placement) scratch[idx] = 1
                const v = evaluator.evaluate(
                    info, scratch, sheet.jokersUsed + move.jokersSpent, counts, summaries, turn, active, totalJokers,
                )[headIndex]
                if (v > bestValue) { bestValue = v; best = move }
            }
            return best
        },
    }
}

export interface ScoredMove { move: Move | null; value: number }

/**
 * Note chaque option d'une decision — le passe d'abord, puis les coups — avec le
 * reseau, moins `denialWeight` x ce que les des restants offrent aux adversaires
 * quand le joueur est actif (voir `makeValueNetDenialBot`). Sert au bot a deni et a
 * la preselection des candidats du bot a recherche.
 */
export function makeMoveRanker(net: ValueNet, head: 'score' | 'margin' = 'margin') {
    const evaluator = new ValueNetEvaluator(net)
    const headIndex = net.heads.indexOf(head)
    if (headIndex === -1) throw new Error(`tete inconnue : ${head}`)
    const mine = new Uint8Array(CELL_COUNT)
    const theirs = new Uint8Array(CELL_COUNT)

    /** Meilleure valeur, passe compris, qu'un adversaire tire d'un lancer depuis son siege. */
    function bestFor(
        cells: TurnContext['cells'], info: GridInfo, opp: Sheet,
        oppOpponents: CheckedMask[], roll: Roll, turn: number, totalJokers: number,
    ): number {
        const counts = opponentCounts(oppOpponents)
        const summaries = summarizeOpponents(info, oppOpponents)
        let best = evaluator.evaluate(info, opp.mask, opp.jokersUsed, counts, summaries, turn, false, totalJokers)[headIndex]
        for (const m of legalMoves(cells, opp, roll, { totalJokers })) {
            theirs.set(opp.mask)
            for (const idx of m.placement) theirs[idx] = 1
            const v = evaluator.evaluate(
                info, theirs, opp.jokersUsed + m.jokersSpent, counts, summaries, turn, false, totalJokers,
            )[headIndex]
            if (v > best) best = v
        }
        return best
    }

    return function rank(ctx: TurnContext, denialWeight: number): ScoredMove[] {
        const { cells, sheet, moves, turn, totalJokers, isActive, fullRoll, opponents } = ctx
        const info = gridInfo(cells)
        const others = (opponents ?? []).map(o => o.mask)
        const counts = opponentCounts(others)
        const summaries = summarizeOpponents(info, others)
        const active = isActive ?? false
        const deny = denialWeight > 0 && active && !!fullRoll && others.length > 0

        const denial = (roll: Roll): number => {
            let sum = 0
            opponents!.forEach((opp, j) => {
                const theirOpponents = [sheet.mask, ...others.filter((_, k) => k !== j)]
                sum += bestFor(cells, info, opp, theirOpponents, roll, turn, totalJokers)
            })
            return sum / opponents!.length
        }
        const byPair = new Map<number, number>()
        const denialForPair = (ci: number, ni: number): number => {
            const key = ci * 8 + ni
            let v = byPair.get(key)
            if (v === undefined) {
                v = denial({
                    colors: fullRoll!.colors.filter((_, i) => i !== ci),
                    numbers: fullRoll!.numbers.filter((_, i) => i !== ni),
                })
                byPair.set(key, v)
            }
            return v
        }

        const out: ScoredMove[] = [{
            move: null,
            value: evaluator.evaluate(info, sheet.mask, sheet.jokersUsed, counts, summaries, turn, active, totalJokers)[headIndex]
                - (deny ? denialWeight * denial(fullRoll!) : 0),
        }]
        const candidates = deny ? legalMovesByDicePair(cells, sheet, fullRoll!, { totalJokers }) : moves
        for (const m of candidates) {
            mine.set(sheet.mask)
            for (const idx of m.placement) mine[idx] = 1
            const v = evaluator.evaluate(
                info, mine, sheet.jokersUsed + m.jokersSpent, counts, summaries, turn, active, totalJokers,
            )[headIndex]
            out.push({ move: m, value: deny ? v - denialWeight * denialForPair(m.colorDieIndex, m.numberDieIndex) : v })
        }
        return out
    }
}

/** Premier maximum strict : le passe gagne les egalites, comme dans `makeValueNetBot`. */
export function bestOf(scored: ScoredMove[]): Move | null {
    let best = scored[0]
    for (const s of scored) if (s.value > best.value) best = s
    return best.move
}

export interface ValueNetDenialOptions {
    head?: 'score' | 'margin'
    /** Poids de ce que les des restants rapportent aux adversaires. 0 = `makeValueNetBot`. */
    denialWeight: number
    name?: string
}

/**
 * Reseau de valeur + DENI DE DES (voir `bots/baselines/denial.ts`).
 *
 * Le reseau note la feuille apres le coup ; il ne voit donc pas quels des restent
 * aux adversaires, et la generation normale fusionne justement les paires de des
 * equivalentes pour soi. Quand le bot est actif, les coups sont enumeres PAR PAIRE
 * et chacun est penalise par ce que les 4 des restants offrent au mieux aux
 * adversaires — mesure par le meme reseau, depuis leur siege et sur la meme tete,
 * donc dans la meme unite (des points) que la valeur du coup. A 2 joueurs et sur la
 * tete `margin`, un poids de 1 est exactement la marge : ce que gagne l'adversaire,
 * je le perds.
 *
 * La feuille propre qui sert d'adversaire a l'adversaire est celle d'AVANT le coup :
 * une approximation, identique pour tous les candidats.
 */
export function makeValueNetDenialBot(
    net: ValueNet, { head = 'margin', denialWeight, name }: ValueNetDenialOptions,
): Bot {
    const rank = makeMoveRanker(net, head)
    return {
        name: name ?? `value-net-${head}-deni-${denialWeight}`,
        chooseMove(ctx: TurnContext): Move | null {
            if (ctx.moves.length === 0) return null
            return bestOf(rank(ctx, denialWeight))
        },
    }
}
