import { describe, expect, it } from 'vitest'
import { initialMoveIndex, pickReviewTarget } from '~/utils/reviewTarget'

const LUC = { id: 'dad2294d-9788-4f90-a27f-4c4f8f7f29c0', name: 'Luc' }
const ANNA = { id: '6a382549-8db0-4c1e-9a1f-2f1b3c4d5e6f', name: 'Anna' }
const BOT_HARD = { id: 'bot:hard:1', name: 'Bot difficile 1' }
const BOT_EASY = { id: 'bot:easy:1', name: 'Bot facile 1' }

describe('quel joueur analyser', () => {
    it('analyse directement la partie du joueur local, sans rien lui faire choisir', () => {
        const pick = pickReviewTarget([LUC, BOT_HARD, ANNA], LUC.id)
        expect(pick).toMatchObject({ target: LUC.id, locked: true })
    })

    it('ne propose jamais un bot', () => {
        const pick = pickReviewTarget([BOT_HARD, LUC, BOT_EASY, ANNA], null)
        expect(pick.choices.map(p => p.id)).toEqual([LUC.id, ANNA.id])
    })

    /** Le joueur local ne peut pas « etre » un bot : son id n'est jamais retenu comme cible. */
    it('ignore un identifiant local qui serait celui d un bot', () => {
        const pick = pickReviewTarget([LUC, BOT_HARD, ANNA], BOT_HARD.id)
        expect(pick.target).not.toBe(BOT_HARD.id)
    })

    it('laisse choisir parmi les humains quand on n a pas joue la partie', () => {
        const pick = pickReviewTarget([LUC, ANNA, BOT_HARD], 'quelqu-un-d-autre')
        expect(pick).toMatchObject({ target: null, locked: false })
        expect(pick.choices).toHaveLength(2)
    })

    it('retient le seul humain d une table de bots', () => {
        const pick = pickReviewTarget([BOT_EASY, LUC, BOT_HARD], 'quelqu-un-d-autre')
        expect(pick).toMatchObject({ target: LUC.id, locked: true })
    })

    it('n a rien a analyser sans joueur humain', () => {
        const pick = pickReviewTarget([BOT_EASY, BOT_HARD], null)
        expect(pick).toMatchObject({ choices: [], target: null, locked: false })
    })
})

describe('coup montre a la fin de l analyse', () => {
    it('ouvre sur la premiere erreur', () => {
        expect(initialMoveIndex([{ verdict: 'bon' }, { verdict: 'excellent' }, { verdict: 'erreur' }, { verdict: 'faute' }])).toBe(2)
    })

    it('compte une faute comme un coup a revoir', () => {
        expect(initialMoveIndex([{ verdict: 'bon' }, { verdict: 'faute' }])).toBe(1)
    })

    it('ouvre sur le premier coup quand il n y a rien a revoir', () => {
        expect(initialMoveIndex([{ verdict: 'bon' }, { verdict: 'excellent' }])).toBe(0)
        expect(initialMoveIndex([])).toBe(0)
    })
})
