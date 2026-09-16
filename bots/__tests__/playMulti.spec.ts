import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ALL_GRIDS } from '../../app/data/grids/index'
import { makeRng } from '../../engine/dice'
import type { Roll } from '../../engine/dice'
import { applyMove, cloneSheet } from '../../engine/state'
import type { Move } from '../../engine/state'
import { makeGreedyV3Bot } from '../heuristicV3'
import { continueMultiGame, playMultiGame, removeChosenDice } from '../playMulti'
import type { MultiPlayerState } from '../playMulti'
import type { Bot, TurnContext } from '../types'

const weights = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
const cells = ALL_GRIDS[2].cells
const SEED = 424242

/** Generateur qui compte ses tirages, pour rejouer les memes des depuis un point donne. */
function countingRng(seed: number) {
    const base = makeRng(seed)
    const rng = Object.assign(() => { rng.calls++; return base() }, { calls: 0 })
    return rng
}

interface Snapshot { turn: number; seat: number; calls: number; pool: Roll; move: Move | null; players: MultiPlayerState[] }

/** Capture l'etat complet juste avant la n-ieme decision qui satisfait `when`. */
function capture(n: number, when: (ctx: TurnContext) => boolean) {
    const inner = makeGreedyV3Bot(weights, 'v3')
    const rng = countingRng(SEED)
    let seen = 0
    let snap: Snapshot | null = null
    const spy: Bot = {
        name: 'v3',
        chooseMove(ctx) {
            const move = inner.chooseMove(ctx)
            if (!snap && when(ctx) && seen++ === n) {
                snap = {
                    turn: ctx.turn, seat: ctx.table!.seat, calls: rng.calls, pool: ctx.fullRoll!, move,
                    players: ctx.table!.players.map(p => ({
                        name: 'v3', bot: inner, sheet: cloneSheet(p.sheet),
                        colorBonus: { ...p.colorBonus }, columnBonus: { ...p.columnBonus }, passes: 0, forcedPasses: 0,
                    })),
                }
            }
            return move
        },
    }
    const full = playMultiGame(cells, [spy, spy, spy], rng)
    return { full, snap: snap! }
}

function resumeFrom(snap: Snapshot) {
    const n = snap.players.length
    const active = snap.turn % n
    const isActive = snap.turn >= 3 && snap.seat === active
    const played = snap.turn < 3
        ? snap.seat + 1
        : isActive ? 1 : 2 + snap.players.map((_, i) => i).filter(i => i !== active && i < snap.seat).length
    if (snap.move) applyMove(snap.players[snap.seat].sheet, snap.move)
    const rng = countingRng(SEED)
    while (rng.calls < snap.calls) rng()
    return continueMultiGame(cells, snap.players, rng, snap.turn, {
        resume: {
            roll: snap.pool, played,
            poolForPassives: isActive && snap.move ? removeChosenDice(snap.pool, snap.move) : snap.pool,
        },
    })
}

describe('continueMultiGame — reprise au milieu d\'un tour', () => {
    it('reprise apres la decision du joueur actif : meme fin de partie', () => {
        const { full, snap } = capture(5, ctx => ctx.turn >= 3 && !!ctx.isActive)
        expect(snap.turn).toBeGreaterThanOrEqual(3)
        const resumed = resumeFrom(snap)
        expect(resumed.scores).toEqual(full.scores)
        expect(resumed.turns).toBe(full.turns)
    })

    it('reprise apres un joueur passif : meme fin de partie', () => {
        const { full, snap } = capture(7, ctx => ctx.turn >= 3 && !ctx.isActive)
        const resumed = resumeFrom(snap)
        expect(resumed.scores).toEqual(full.scores)
        expect(resumed.turns).toBe(full.turns)
    })

    it('reprise pendant les tours simultanes : meme fin de partie', () => {
        const { full, snap } = capture(1, ctx => ctx.turn < 3)
        const resumed = resumeFrom(snap)
        expect(resumed.scores).toEqual(full.scores)
    })
})
