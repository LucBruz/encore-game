import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../gameStore'

/**
 * La file des animations de couleur complete pilote deux choses a la fois :
 * l'animation affichee, et l'ecran de fin, qui attend qu'elle soit vide.
 *
 * Constate en production : sur une partie terminee puis rechargee, le rejeu
 * avait remis en file les couleurs completees de toute la partie, et l'ecran de
 * fin — donc « Analyser ma partie » — ne s'affichait plus.
 */
describe('file des animations de couleur', () => {
    beforeEach(() => setActivePinia(createPinia()))

    it('se vide entierement, pour qu une reconnexion ne rejoue pas les celebrations', () => {
        const store = useGameStore()
        store.completionQueue.push({ playerId: 'a', color: 'o' }, { playerId: 'a', color: 'g' })
        store.pendingColorAnimations.push({ playerId: 'b', color: 'y' })
        expect(store.lastColorCompleted).toEqual({ playerId: 'a', color: 'o' })

        store.clearCompletionAnimations()

        expect(store.completionQueue).toEqual([])
        expect(store.pendingColorAnimations).toEqual([])
        // L'ecran de fin s'affiche quand ce getter est vide.
        expect(store.lastColorCompleted).toBeNull()
    })

    it('presente les couleurs une par une, dans l ordre', () => {
        const store = useGameStore()
        store.completionQueue.push({ playerId: 'a', color: 'o' }, { playerId: 'b', color: 'g' })
        store.popCompletionQueue()
        expect(store.lastColorCompleted).toEqual({ playerId: 'b', color: 'g' })
        store.popCompletionQueue()
        expect(store.lastColorCompleted).toBeNull()
    })
})
