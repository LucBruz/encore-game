import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { isProxy } from 'vue'
import { useGameStore } from '~/stores/gameStore'
import { applyGameAction } from '~/utils/applyGameAction'
import { replayDecisions } from '~~/analysis/replay'
import { sameMove } from '~~/analysis/evaluate'
import type { GameEvent } from '~~/analysis/replay'

/**
 * Journal reel, extrait de la partie 0VITRI jouee en production : les deux
 * premiers tours, un humain qui passe et un bot qui place.
 *
 * Des evenements inventes ne testeraient que ma comprehension du format. Ceux-ci
 * ont ete produits par le jeu lui-meme.
 */
const HUMAN = 'dad2294d-9788-4f90-a27f-4c4f8f7f29c0'
const BOT = 'bot:hard:1'

const roll = (colors: unknown[], numbers: unknown[]) => ({
    roll: {
        colorDices: colors.map(value => ({ type: 'color', value })),
        numberDices: numbers.map(value => ({ type: 'number', value })),
    },
})

const EVENTS: GameEvent[] = [
    { event_type: 'ROLL_DICES', payload: roll(['joker', 'y', 'g'], [5, 1, 5]) },
    { event_type: 'CONFIRM_PASSIVE', payload: { playerId: BOT, colorDiceIndex: 1, numberDiceIndex: 0 } },
    ...[82, 83, 98, 99, 97].map(cellIdx => ({
        event_type: 'TOGGLE_CELL', payload: { cellIdx, playerId: BOT },
    })),
    { event_type: 'CONFIRM_PLACEMENT', payload: { playerId: BOT } },
    { event_type: 'PASS_PASSIVE', payload: { playerId: HUMAN } },
    { event_type: 'NEXT_TURN', payload: {} },
    { event_type: 'ROLL_DICES', payload: roll(['y', 'p', 'b'], [1, 1, 4]) },
    { event_type: 'PASS_PASSIVE', payload: { playerId: HUMAN } },
    { event_type: 'CONFIRM_PASSIVE', payload: { playerId: BOT, colorDiceIndex: 1, numberDiceIndex: 2 } },
    ...[23, 38, 39, 37].map(cellIdx => ({
        event_type: 'TOGGLE_CELL', payload: { cellIdx, playerId: BOT },
    })),
    { event_type: 'CONFIRM_PLACEMENT', payload: { playerId: BOT } },
]

function freshStore() {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.initPlayers([{ id: HUMAN, name: 'TestRejeu' }, { id: BOT, name: 'Bot difficile 1' }])
    store.initGrid('01')
    return store
}

describe('rejeu du journal vers des positions de decision', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('reconstruit le meme plateau que l application directe des evenements', () => {
        const direct = freshStore()
        for (const e of EVENTS) applyGameAction(direct, e.event_type as any, e.payload)
        const expected = direct.players.map(p => [...p.checkedCells].sort((a, b) => a - b))

        const replayed = freshStore()
        replayDecisions(replayed, EVENTS)
        const got = replayed.players.map(p => [...p.checkedCells].sort((a, b) => a - b))

        expect(got).toEqual(expected)
    })

    /**
     * L'invariant qui compte. Si le rejeu se trompe sur l'etat — mauvais lancer,
     * mauvaise feuille, mauvais joueur — le coup reellement joue ne figurera pas
     * parmi les coups legaux calcules pour cette position. C'est ce test qui a
     * attrape la conversion manquante entre les des du store, objets
     * `{ type, value }`, et les faces attendues par le moteur.
     */
    it('retrouve chaque coup joue parmi les coups legaux de sa position', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        const played = decisions.filter(d => d.played !== null)
        expect(played.length).toBeGreaterThan(0)

        for (const d of played) {
            const found = d.candidates.some(c => sameMove(c, d.played))
            expect(found, `tour ${d.turn}, ${d.playerName}, cases ${d.played!.placement}`).toBe(true)
        }
    })

    it('extrait autant de decisions que de coups et de passes', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        // Deux placements du bot, deux passes de l'humain.
        expect(decisions.length).toBe(4)
        expect(decisions.filter(d => d.played === null).length).toBe(2)
        expect(decisions.filter(d => d.playerId === BOT).map(d => d.played!.placement.length))
            .toEqual([5, 4])
    })

    it('propose toujours le passe volontaire comme option', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        for (const d of decisions) expect(d.candidates).toContain(null)
    })

    /**
     * Le store garde une entree par couleur et par colonne, a `null` tant
     * qu'elle n'est pas acquise, et indexe les colonnes par LETTRE. Le moteur
     * n'attend que les acquises, indexees par numero.
     *
     * Laisser passer les `null` ne plante pas : `scorePlayer` compte
     * `v === 'first' ? 5 : 3`, donc chaque couleur NON acquise aurait rapporte
     * 3 points a tous les joueurs, dans toutes les analyses, sans rien casser.
     * Les lettres de colonnes, elles, plantaient. C'est la moitie silencieuse
     * que ce test protege.
     */
    it('ne convertit que les bonus reellement acquis', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        for (const d of decisions) {
            for (const p of d.players) {
                expect(Object.values(p.colorBonus)).not.toContain(null)
                expect(Object.values(p.columnBonus)).not.toContain(null)
                for (const key of Object.keys(p.columnBonus)) {
                    expect(Number.isInteger(Number(key)), `colonne « ${key} »`).toBe(true)
                }
            }
        }
        // Personne n'a complete quoi que ce soit en deux tours : tout doit etre vide.
        const first = decisions[0]
        expect(Object.keys(first.players[0].colorBonus)).toHaveLength(0)
        expect(Object.keys(first.players[0].columnBonus)).toHaveLength(0)
    })

    /**
     * Mesure faite : une decision analysee avec les cases du store, qui sont un
     * proxy reactif Pinia, prenait 30,6 s contre 2,0 s avec une copie brute, pour
     * un verdict identique. Rien ne casse si ce test tombe — tout devient
     * seulement quinze fois plus lent, ce qui est exactement le genre de
     * regression qu'aucun autre test ne verrait.
     */
    it('rend des positions detachees de la reactivite du store', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        expect(decisions.length).toBeGreaterThan(0)
        for (const d of decisions) expect(isProxy(d.cells)).toBe(false)
    })

    it('photographie la position AVANT le coup, pas apres', () => {
        const decisions = replayDecisions(freshStore(), EVENTS)
        const first = decisions.find(d => d.playerId === BOT)!
        // Au premier tour le bot n'a encore rien coche : sa feuille doit etre vide.
        expect(first.players[first.seat].sheet.mask.some(v => v === 1)).toBe(false)
    })
})
