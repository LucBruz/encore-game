import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { makeGreedyV3Bot } from '~~/bots/heuristicV3'
import type { WeightsV3 } from '~~/bots/heuristicV3'
import { reviewGame } from '~~/analysis/game'
import { BOT, EVENTS, HUMAN, freshStore } from './fixtures'

const W: WeightsV3 = JSON.parse(readFileSync('public/data/tuned-weights-multi.json', 'utf8')).tuned
const bot = makeGreedyV3Bot(W, 'v3-multi')

/**
 * Budget minuscule : ces tests portent sur ce que la review transmet a la page,
 * pas sur la justesse des verdicts, mesuree par les scripts d'analyse.
 */
const FAST = { rollouts: 4, screenRollouts: 2, shortlist: 2, horizon: 1 }

describe('review — ce qui part vers la page', { timeout: 30_000 }, () => {
    /**
     * Sans les cases deja cochees, le plateau de la page ne montrait que le coup
     * sur une grille vide : impossible de comprendre un coup sans sa position.
     */
    it('transmet la feuille telle qu elle etait AVANT chaque coup', () => {
        const review = reviewGame(freshStore(), EVENTS, { rolloutBot: bot, playerId: BOT, ...FAST })
        expect(review.moves).toHaveLength(2)

        // Premier coup : feuille vide.
        expect(review.moves[0].checkedBefore).toEqual([])
        // Second coup : exactement les cinq cases du premier.
        expect([...review.moves[1].checkedBefore].sort((a, b) => a - b)).toEqual([82, 83, 97, 98, 99])

        // La position precede le coup : aucune case jouee n'y figure deja.
        for (const m of review.moves) {
            for (const cell of m.played?.placement ?? []) expect(m.checkedBefore).not.toContain(cell)
        }
    })

    it('garde les passes, avec la feuille du moment', () => {
        const review = reviewGame(freshStore(), EVENTS, { rolloutBot: bot, playerId: HUMAN, ...FAST })
        expect(review.moves).toHaveLength(2)
        for (const m of review.moves) {
            expect(m.played).toBeNull()
            expect(m.checkedBefore).toEqual([])
        }
    })
})
