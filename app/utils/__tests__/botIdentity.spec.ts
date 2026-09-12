import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '~/composables/useBotPlayer'
import type { DifficultyId } from '~/composables/useBotPlayer'
import {
    BOT_LABELS, botDisplayName, isBotId, makeBotId, nextBotIndex, parseBotId,
} from '~/utils/botIdentity'

const ALL: DifficultyId[] = ['easy', 'medium', 'hard']

describe('identite des bots', () => {
    it('fait un aller-retour sur tous les niveaux', () => {
        for (const difficulty of ALL) {
            for (const index of [1, 2, 7, 42]) {
                expect(parseBotId(makeBotId(difficulty, index))).toEqual({ difficulty, index })
            }
        }
    })

    /**
     * Le garde-fou qui compte : un identifiant humain ne doit jamais etre pris
     * pour un bot, sinon un client piloterait le joueur de quelqu'un d'autre.
     */
    it('rejette tout ce qui n est pas exactement bot:<niveau>:<n>', () => {
        const humains = [
            'p-human', 'bot', 'bot:', 'bot:hard', 'bot:hard:', 'bot:hard:0',
            'bot:hard:-1', 'bot:hard:1:2', 'bot:expert:1', 'bot:HARD:1',
            'bot-hard-1', 'Bot:hard:1', 'bot:hard:abc', 'bot:hard:1.5',
            'bot:hard: 1', '', 'xbot:hard:1',
        ]
        for (const id of humains) {
            expect(parseBotId(id), id).toBeNull()
            expect(isBotId(id), id).toBe(false)
        }
    })

    it('reconnait un identifiant de bot', () => {
        expect(isBotId('bot:easy:1')).toBe(true)
        expect(isBotId(makeBotId('medium', 3))).toBe(true)
    })

    /**
     * Les libelles sont dupliques dans botIdentity pour que le salon n'ait pas a
     * charger le moteur de bots. Ce test est ce qui empeche les deux copies de
     * diverger.
     */
    it('garde les libelles alignes sur DIFFICULTIES', () => {
        for (const difficulty of ALL) {
            expect(BOT_LABELS[difficulty]).toBe(DIFFICULTIES[difficulty].label)
        }
        expect(Object.keys(BOT_LABELS).sort()).toEqual(Object.keys(DIFFICULTIES).sort())
    })

    it('nomme les bots lisiblement', () => {
        expect(botDisplayName('easy', 1)).toBe('Bot facile 1')
        expect(botDisplayName('hard', 2)).toBe('Bot difficile 2')
    })
})

describe('attribution du numero', () => {
    it('part de 1 quand aucun bot du niveau n est present', () => {
        expect(nextBotIndex([], 'hard')).toBe(1)
        expect(nextBotIndex(['p-human', 'bot:easy:1'], 'hard')).toBe(1)
    })

    it('compte par niveau et non globalement', () => {
        const ids = ['bot:easy:1', 'bot:easy:2', 'bot:hard:1']
        expect(nextBotIndex(ids, 'easy')).toBe(3)
        expect(nextBotIndex(ids, 'hard')).toBe(2)
        expect(nextBotIndex(ids, 'medium')).toBe(1)
    })

    /** Apres un retrait, le trou est reutilise plutot que de laisser un doublon. */
    it('comble un numero libere', () => {
        expect(nextBotIndex(['bot:hard:1', 'bot:hard:3'], 'hard')).toBe(2)
    })

    it('ignore les identifiants humains', () => {
        expect(nextBotIndex(['bot-hard-9', 'bot:hard:zzz', 'luc'], 'hard')).toBe(1)
    })
})
