import { rollDice } from '../engine/dice'
import type { Rng } from '../engine/dice'
import { scoreSheet } from '../engine/scoring'
import type { BonusMode, ScoreBreakdown } from '../engine/scoring'
import { DEFAULT_TOTAL_JOKERS, applyMove, createSheet, isGameOver, legalMoves } from '../engine/state'
import type { Sheet } from '../engine/state'
import type { Cells } from '../engine/types'
import type { Bot } from './types'

export interface GameOptions {
    /** Garde-fou : une feuille solo peut ne jamais completer 2 couleurs. */
    maxTurns?: number
    mode?: BonusMode
    totalJokers?: number
}

export interface GameResult {
    score: number
    breakdown: ScoreBreakdown
    turns: number
    /** La partie s'est terminee par 2 couleurs completes, et non par la limite de tours. */
    endedNaturally: boolean
    passes: number
    sheet: Sheet
}

export function playGame(
    cells: Cells,
    bot: Bot,
    rng: Rng,
    opts: GameOptions = {},
): GameResult {
    const maxTurns = opts.maxTurns ?? 50
    const totalJokers = opts.totalJokers ?? DEFAULT_TOTAL_JOKERS
    const sheet = createSheet()

    let turn = 0
    let passes = 0
    let endedNaturally = false

    for (; turn < maxTurns; turn++) {
        if (isGameOver(cells, sheet)) { endedNaturally = true; break }

        const roll = rollDice(rng)
        const moves = legalMoves(cells, sheet, roll, { totalJokers })
        const move = bot.chooseMove({ cells, sheet, moves, turn, totalJokers, rng })

        if (!move) { passes++; continue }
        applyMove(sheet, move)
    }

    if (isGameOver(cells, sheet)) endedNaturally = true

    // Le malus etoiles s'applique a la fin, y compris quand la limite de tours a
    // ete atteinte : sinon les parties tronquees auraient un score artificiellement
    // plus eleve que celles qui vont au bout.
    const breakdown = scoreSheet(cells, sheet.mask, sheet.jokersUsed, {
        gameOver: true,
        mode: opts.mode ?? 'average',
        totalJokers,
    })

    return { score: breakdown.total, breakdown, turns: turn, endedNaturally, passes, sheet }
}
