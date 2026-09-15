/**
 * Donnees CONTRASTEES pour le reseau de valeur : ce que vaut chaque coup d'une
 * meme position, mesure par deroulements apparies sous v3-multi.
 *
 *   npx tsx scripts/gen-rollouts.ts --games 20 --out training/data/roll-probe.bin
 *   npx tsx scripts/gen-rollouts.ts --games 400 --shard 3 --shards 10 --out training/data/roll-3.bin
 *
 * Pourquoi : le premier reseau, entraine sur l'issue des parties, predisait bien
 * (RMSE 6,40 contre 8,00) et jouait mal (-7,67 contre v3-multi). Mesure, trois
 * causes, que ces donnees attaquent toutes :
 *
 *   1. Il estimait la valeur d'une politique MELANGEE et plus faible que v3
 *      (le panel). Choisir le meilleur coup selon une valeur n'ameliore que la
 *      politique qui l'a produite. Ici tous les deroulements sont joues par
 *      v3-multi : choisir le meilleur coup selon ces valeurs est une etape
 *      d'amelioration de politique AU-DESSUS de v3.
 *   2. Il n'avait jamais vu deux coups d'une meme position. Ses « derivees » —
 *      le prix d'un joker (-1,52 point) — venaient de comparaisons ENTRE
 *      positions, ou dépenser un joker va de pair avec avancer. Ici chaque
 *      position est ecrite avec plusieurs de ses coups.
 *   3. Le score final varie de +/-8 points selon les des ; l'ecart entre deux
 *      coups vaut 0,5 a 2. Les candidats d'une position sont deroules avec LES
 *      MEMES graines : le bruit commun disparait des differences.
 *
 * Positions : parties du panel (`makePanel`), graines 5350000 + g * 7919.
 * Candidats : les TOP_K meilleurs selon v3-multi, le passe, et RANDOM autres au
 * hasard pour que le reseau apprenne aussi pourquoi un coup est mauvais.
 *
 * Sorties : `<out>` au format brut de `lib/valueData.ts` (slot 0 = position apres
 * le candidat), et `<out>.targets` avec, par candidat, 16 octets :
 *   f32 score moyen du joueur, f32 marge moyenne (score moins meilleur adverse),
 *   u32 identifiant de la position, u8 drapeaux (1 meilleur selon v3, 2 passe,
 *   4 meilleur selon le reseau avec `--net`),
 *   u8 nombre de candidats ecrits pour cette position, u16 libre.
 */
import { closeSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs'
import { ALL_GRIDS } from '../app/data/grids/index'
import { makeRng } from '../engine/dice'
import { applyMove, cloneSheet } from '../engine/state'
import type { Move } from '../engine/state'
import { gridStats } from '../engine/scoring'
import type { Cells } from '../engine/types'
import { V3Scorer, makeGreedyV3Bot } from '../bots/heuristicV3'
import { continueMultiGame, playMultiGame } from '../bots/playMulti'
import type { DecisionObservation, MultiPlayerState } from '../bots/playMulti'
import { gridInfo, opponentCounts, summarizeOpponents } from '../bots/valueFeatures'
import { ValueNetEvaluator, loadValueNet, makeValueNetBot } from '../bots/valueNet'
import { RECORD_BYTES, SEATS, encode, loadMultiWeights, makePanel } from './lib/valueData'

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const GAMES = Number(arg('games', '20'))
const SEED = Number(arg('seed', '5350000'))
const ROLLOUT_SEED = Number(arg('rolloutSeed', '5450000'))
const SHARD = Number(arg('shard', '0'))
const SHARDS = Number(arg('shards', '1'))
const ROLLOUTS = Number(arg('rollouts', '8'))
const TOP_K = Number(arg('topK', '6'))
const RANDOM = Number(arg('random', '1'))
const SAMPLE_RATE = Number(arg('sample', '0.08'))
const MAX_TURNS = Number(arg('maxTurns', '60'))
const OUT = arg('out', 'training/data/roll-probe.bin')
// Reprise d'une tranche interrompue : rejoue a partir de la partie locale FROM et
// ecrit A LA SUITE des fichiers. Les positions etant ecrites une par une (brut puis
// cibles), une interruption laisse deux fichiers de meme longueur en positions ;
// le verifier avant de reprendre.
const FROM = Number(arg('from', '0'))
// Donnees SUR LA POLITIQUE DU RESEAU (`--net <json>`). Mesure qui les motive : sur les
// parties du reseau, ses coups valent ceux de v3 quand v3 joue la suite (+0,10), et
// -0,55 quand c'est lui (scripts/check-disagreements.ts --continuation net). Des cibles
// deroulees sous v3 apprennent ce que vaut une position POUR v3. Avec `--net` :
//   - positions : le reseau au siege g % 4, v3-multi aux autres, seules ses decisions ;
//   - candidats : top TOP_K de v3, top NET_K du reseau, passe, RANDOM au hasard ;
//   - deroulements : le reseau joue le siege du decideur, v3-multi les autres.
// Graines a prendre hors des blocs deja servis : 5550000 (positions), 5650000 (des).
const NET = arg('net', '')
const NET_K = Number(arg('netK', '4'))
const TARGET_BYTES = 16

const PANEL = makePanel()
const vMulti = loadMultiWeights()
const rolloutBot = makeGreedyV3Bot(vMulti, 'v3-multi')
const net = NET ? loadValueNet(JSON.parse(readFileSync(NET, 'utf8'))) : null
const netBot = net ? makeValueNetBot(net, 'reseau') : null
const evaluator = net ? new ValueNetEvaluator(net) : null

function rollout(o: DecisionObservation, cells: Cells, move: Move | null, seed: number): [number, number] {
    const players: MultiPlayerState[] = o.players.map((p, i) => {
        const sheet = cloneSheet(p.sheet)
        if (i === o.seat && move) applyMove(sheet, move)
        return {
            name: p.name, bot: netBot && i === o.seat ? netBot : rolloutBot, sheet,
            colorBonus: { ...p.colorBonus }, columnBonus: { ...p.columnBonus },
            passes: 0, forcedPasses: 0,
        }
    })
    // Reprise au tour suivant, comme `analysis/evaluate.ts` : les coups adverses du
    // tour en cours ne sont pas rejoues. Biais identique pour tous les candidats.
    const r = continueMultiGame(cells, players, makeRng(seed), o.turn + 1, { maxTurns: MAX_TURNS })
    const mine = r.scores[o.seat]
    let bestOther = -Infinity
    r.scores.forEach((s, i) => { if (i !== o.seat) bestOther = Math.max(bestOther, s) })
    return [mine, mine - bestOther]
}

mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true })
const fdRaw = openSync(OUT, FROM > 0 ? 'a' : 'w')
const fdTargets = openSync(`${OUT}.targets`, FROM > 0 ? 'a' : 'w')
const started = Date.now()
let positions = 0
let records = 0

for (let local = FROM; local < GAMES; local++) {
    const g = SHARD + local * SHARDS
    const gridIndex = g % ALL_GRIDS.length
    const cells: Cells = ALL_GRIDS[gridIndex].cells
    const stats = gridStats(cells)
    const netSeat = g % SEATS
    const seating = netBot
        ? Array.from({ length: SEATS }, (_, s) => (s === netSeat ? netBot : rolloutBot))
        : Array.from({ length: SEATS }, (_, s) => PANEL[(g + s) % PANEL.length])
    const pick = makeRng((SEED ^ 0x5bd1e995) + g * 31)

    const sampled: DecisionObservation[] = []
    playMultiGame(cells, seating, makeRng(SEED + g * 7919), {
        maxTurns: MAX_TURNS,
        observe: o => {
            if (netBot && o.seat !== netSeat) return
            if (o.candidates.length >= 3 && pick() < SAMPLE_RATE && sampled.length < 64) sampled.push(o)
        },
    })

    sampled.forEach((o, d) => {
        const me = o.players[o.seat].sheet
        const scorer = new V3Scorer(cells, me.mask, me.jokersUsed, stats, vMulti, 8, o.turn)
        const ranked = [...o.candidates].sort((a, b) =>
            (b ? scorer.scoreAfter(b) : scorer.value) - (a ? scorer.scoreAfter(a) : scorer.value))
        const chosen = ranked.slice(0, TOP_K)
        let netBest: Move | null | undefined
        if (evaluator) {
            const info = gridInfo(cells)
            const others = o.players.filter((_, k) => k !== o.seat).map(p => p.sheet.mask)
            const counts = opponentCounts(others)
            const summaries = summarizeOpponents(info, others)
            const isActive = o.turn >= 3 && o.seat === o.turn % o.players.length
            const value = new Map(o.candidates.map(m => {
                const s = cloneSheet(me)
                if (m) applyMove(s, m)
                return [m, evaluator.evaluate(info, s.mask, s.jokersUsed, counts, summaries, o.turn, isActive, 8)[0]]
            }))
            const byNet = [...o.candidates].sort((a, b) => value.get(b)! - value.get(a)!)
            netBest = byNet[0]
            for (const m of byNet.slice(0, NET_K)) if (!chosen.includes(m)) chosen.push(m)
        }
        if (!chosen.includes(null)) chosen.push(null)
        const rest = ranked.filter(m => !chosen.includes(m))
        for (let k = 0; k < RANDOM && rest.length; k++) chosen.push(rest.splice(Math.floor(pick() * rest.length), 1)[0])

        const group = g * 64 + d
        const raw = Buffer.alloc(chosen.length * RECORD_BYTES)
        const targets = Buffer.alloc(chosen.length * TARGET_BYTES)
        chosen.forEach((move, c) => {
            let score = 0, margin = 0
            for (let r = 0; r < ROLLOUTS; r++) {
                // Memes graines pour tous les candidats de la position : comparaison appariee.
                const [s, m] = rollout(o, cells, move, (ROLLOUT_SEED + group * 104729 + r * 7919) >>> 0)
                score += s
                margin += m
            }
            encode(raw, c * RECORD_BYTES, gridIndex, { ...o, played: move }, null)
            const t = c * TARGET_BYTES
            targets.writeFloatLE(score / ROLLOUTS, t)
            targets.writeFloatLE(margin / ROLLOUTS, t + 4)
            targets.writeUInt32LE(group >>> 0, t + 8)
            targets[t + 12] = (move === ranked[0] ? 1 : 0) | (move === null ? 2 : 0) | (move === netBest ? 4 : 0)
            targets[t + 13] = chosen.length
        })
        writeSync(fdRaw, raw)
        writeSync(fdTargets, targets)
        positions++
        records += chosen.length
    })

    if ((local + 1) % 20 === 0 || local + 1 === GAMES) {
        const s = (Date.now() - started) / 1000
        console.log(
            `  ${local + 1}/${GAMES} parties, ${positions} positions, ${records} candidats, `
            + `${(s / Math.max(1, positions)).toFixed(2)} s/position`,
        )
    }
}
closeSync(fdRaw)
closeSync(fdTargets)
console.log(`${positions} positions, ${records} candidats en ${((Date.now() - started) / 1000).toFixed(0)} s -> ${OUT}`)
