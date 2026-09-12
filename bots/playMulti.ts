import { rollDice } from '../engine/dice'
import type { Rng, Roll } from '../engine/dice'
import { COLUMN_POINTS, COLS } from '../app/data/grids/grid-01'
import { CELL_COUNT, GRID_COLS, GRID_ROWS } from '../engine/grid'
import { completedColors, completedColumns } from '../engine/scoring'
import type { ColorKey } from '../engine/types'
import { DEFAULT_TOTAL_JOKERS, applyMove, cloneSheet, createSheet, legalMoves } from '../engine/state'
import type { Move, Sheet } from '../engine/state'
import type { Cells } from '../engine/types'
import type { Bot } from './types'

/**
 * Partie multijoueur fidele a la regle, contrairement a `play.ts` qui est
 * mono-agent.
 *
 * Trois choses que le solitaire ne peut pas capturer :
 *
 * 1. LE DENI DE DES — le joueur actif met sa paire de cote ; les autres ne
 *    choisissent que parmi les 4 des restants. S'il passe, ils ont les 6.
 * 2. LA FIN DECIDEE PAR AUTRUI — la partie s'arrete des qu'UN joueur complete
 *    deux couleurs. Un agent qui temporise se fait couper par les autres, ce qui
 *    est invisible en solitaire ou l'agent controle seul la duree.
 * 3. PREMIER / SUIVANTS — les bonus de colonne et de couleur valent plus au
 *    premier qui les complete. Le solitaire devait choisir un mode arbitraire.
 */
export interface MultiPlayerState {
    name: string
    bot: Bot
    sheet: Sheet
    colorBonus: Partial<Record<ColorKey, 'first' | 'others'>>
    columnBonus: Record<number, 'first' | 'others'>
    passes: number
    forcedPasses: number
}

export interface MultiResult {
    scores: number[]
    names: string[]
    turns: number
    winnerIndex: number
    /** Index du joueur qui a declenche la fin en completant deux couleurs. */
    enderIndex: number
    passes: number[]
    jokersUsed: number[]
    endedNaturally: boolean
}

const COLOR_KEYS: ColorKey[] = ['g', 'y', 'b', 'p', 'o']

function scorePlayer(cells: Cells, p: MultiPlayerState, totalJokers: number): number {
    let total = 0
    for (const v of Object.values(p.colorBonus)) total += v === 'first' ? 5 : 3
    for (const [col, v] of Object.entries(p.columnBonus)) {
        const pts = COLUMN_POINTS[COLS[Number(col)]]
        total += v === 'first' ? pts.first : pts.others
    }
    total += Math.max(0, totalJokers - p.sheet.jokersUsed)
    for (let i = 0; i < CELL_COUNT; i++) if (cells[i][1] && !p.sheet.mask[i]) total -= 2
    return total
}

/** Retire du lancer la paire de des mise de cote par le joueur actif. */
function removeChosenDice(roll: Roll, move: Move): Roll {
    return {
        colors: roll.colors.filter((_, i) => i !== move.colorDieIndex),
        numbers: roll.numbers.filter((_, i) => i !== move.numberDieIndex),
    }
}

/**
 * Position complete au moment ou un joueur doit decider, plus le coup qu'il a
 * choisi. C'est la matiere premiere de l'analyse d'apres-partie : elle a besoin
 * de la position ET des coups possibles, qu'il serait absurde de recalculer
 * depuis un journal alors que la boucle de jeu les a deja sous la main.
 */
export interface DecisionObservation {
    turn: number
    seat: number
    players: {
        name: string
        sheet: Sheet
        colorBonus: Partial<Record<ColorKey, 'first' | 'others'>>
        columnBonus: Record<number, 'first' | 'others'>
    }[]
    /** Coups legaux, plus `null` pour l'option de passer volontairement. */
    candidates: (Move | null)[]
    played: Move | null
}

export interface MultiOptions {
    maxTurns?: number
    totalJokers?: number
    /**
     * Appele avant chaque coup, une fois le choix fait. Coute un clonage des
     * feuilles par decision, d'ou l'option : une partie normale ne le paie pas.
     */
    observe?: (observation: DecisionObservation) => void
}

export function playMultiGame(
    cells: Cells,
    bots: Bot[],
    rng: Rng,
    opts: MultiOptions = {},
): MultiResult {
    const players: MultiPlayerState[] = bots.map(bot => ({
        name: bot.name,
        bot,
        sheet: createSheet(),
        colorBonus: {},
        columnBonus: {},
        passes: 0,
        forcedPasses: 0,
    }))
    return continueMultiGame(cells, players, rng, 0, opts)
}

/**
 * Meme partie, reprise depuis un etat quelconque.
 *
 * C'est ce dont l'analyse d'apres-partie a besoin : pour estimer ce que vaut un
 * coup, il faut derouler la suite A PARTIR de la position reelle, adversaires
 * compris. Un deroulement mono-agent ne conviendrait pas — le protocole du
 * projet a mesure qu'il ne punit pas la temporisation et classe donc les coups
 * lents bien trop haut.
 *
 * `players` est consomme tel quel : les feuilles sont modifiees. A l'appelant de
 * cloner ce qu'il veut conserver.
 */
export function continueMultiGame(
    cells: Cells,
    players: MultiPlayerState[],
    rng: Rng,
    startTurn: number,
    opts: MultiOptions = {},
): MultiResult {
    const maxTurns = opts.maxTurns ?? 60
    const totalJokers = opts.totalJokers ?? DEFAULT_TOTAL_JOKERS

    let turn = startTurn
    let enderIndex = -1
    let endedNaturally = false

    for (; turn < maxTurns; turn++) {
        const activeIndex = turn % players.length
        const roll = rollDice(rng)

        // Snapshot AVANT le tour : qui avait deja reclame quoi. Deux joueurs qui
        // completent la meme colonne au meme tour ne peuvent pas etre "premier"
        // tous les deux ; la priorite va au joueur actif.
        const colorClaimed = new Set<ColorKey>()
        const columnClaimed = new Set<number>()
        for (const p of players) {
            for (const c of Object.keys(p.colorBonus) as ColorKey[]) colorClaimed.add(c)
            for (const col of Object.keys(p.columnBonus)) columnClaimed.add(Number(col))
        }

        // Ordre de jeu : l'actif choisit en premier et retire ses des,
        // sauf pendant les 3 premiers lancers ou tout le monde a les 6 des.
        const simultaneous = turn < 3
        const order = simultaneous
            ? players.map((_, i) => i)
            : [activeIndex, ...players.map((_, i) => i).filter(i => i !== activeIndex)]

        let poolForPassives: Roll = roll

        for (const idx of order) {
            const p = players[idx]
            const pool = (simultaneous || idx === activeIndex) ? roll : poolForPassives
            const moves = legalMoves(cells, p.sheet, pool, { totalJokers })

            const isActive = !simultaneous && idx === activeIndex
            const move = moves.length === 0
                ? null
                : p.bot.chooseMove({
                    cells, sheet: p.sheet, moves, turn, totalJokers, rng,
                    // Contexte multijoueur : seul un agent conscient du deni s'en sert.
                    isActive,
                    fullRoll: pool,
                    opponents: players.filter((_, i) => i !== idx).map(o => o.sheet),
                })

            if (opts.observe) {
                opts.observe({
                    turn,
                    seat: idx,
                    players: players.map(other => ({
                        name: other.name,
                        sheet: cloneSheet(other.sheet),
                        colorBonus: { ...other.colorBonus },
                        columnBonus: { ...other.columnBonus },
                    })),
                    candidates: [...moves, null],
                    played: move,
                })
            }

            if (!move) {
                p.passes++
                if (moves.length === 0) p.forcedPasses++
                // Regle : si l'actif ne coche rien, les autres gardent les 6 des.
                continue
            }

            if (!simultaneous && idx === activeIndex) {
                poolForPassives = removeChosenDice(roll, move)
            }
            applyMove(p.sheet, move)
        }

        // Resolution des bonus, actif d'abord (priorite en cas d'egalite).
        const claimedThisTurn = { colors: new Set<ColorKey>(), columns: new Set<number>() }
        for (const idx of order) {
            const p = players[idx]
            for (const c of completedColors(cells, p.sheet.mask)) {
                if (p.colorBonus[c]) continue
                p.colorBonus[c] = (colorClaimed.has(c) || claimedThisTurn.colors.has(c)) ? 'others' : 'first'
                claimedThisTurn.colors.add(c)
            }
            for (const col of completedColumns(p.sheet.mask)) {
                if (p.columnBonus[col]) continue
                p.columnBonus[col] = (columnClaimed.has(col) || claimedThisTurn.columns.has(col)) ? 'others' : 'first'
                claimedThisTurn.columns.add(col)
            }
        }

        // Fin de partie : le tour en cours est termine pour tout le monde.
        const finished = players.findIndex(p => Object.keys(p.colorBonus).length >= 2)
        if (finished !== -1) { enderIndex = finished; endedNaturally = true; turn++; break }
    }

    const scores = players.map(p => scorePlayer(cells, p, totalJokers))
    let winnerIndex = 0
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[winnerIndex]) winnerIndex = i

    return {
        scores,
        names: players.map(p => p.name),
        turns: turn,
        winnerIndex,
        enderIndex,
        passes: players.map(p => p.passes),
        jokersUsed: players.map(p => p.sheet.jokersUsed),
        endedNaturally,
    }
}

export { GRID_ROWS, GRID_COLS, COLOR_KEYS }
