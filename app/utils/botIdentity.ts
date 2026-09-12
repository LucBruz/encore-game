import type { DifficultyId } from '~/composables/useBotPlayer'

/**
 * Identite des bots en multijoueur.
 *
 * Un bot est une ligne `game_players` ordinaire : c'est son `player_id` qui le
 * distingue, pas une colonne. Le choix evite une migration et toute revue des
 * politiques RLS, au prix d'une semantique portee par une convention de
 * nommage — d'ou ce module, seul endroit qui connait la convention. Nulle part
 * ailleurs on ne compare un identifiant a la main.
 *
 * Forme : `bot:<niveau>:<n>`, ou <niveau> est une cle de DIFFICULTIES et <n>
 * distingue deux bots de meme niveau a la meme table.
 *
 * Import de TYPE uniquement depuis useBotPlayer : ce module est charge par le
 * salon, sur la page d'accueil, et une import de valeur y tirerait tout le
 * moteur de bots dans le bundle d'une page qui ne joue aucun coup. Les
 * libelles sont donc redupliques ici, et `botIdentity.spec.ts` verifie qu'ils
 * ne divergent pas de DIFFICULTIES.
 */

const PREFIX = 'bot'
const SEPARATOR = ':'

export const BOT_LABELS: Record<DifficultyId, string> = {
    easy: 'Facile',
    medium: 'Moyen',
    hard: 'Difficile',
}

export function makeBotId(difficulty: DifficultyId, index: number): string {
    return [PREFIX, difficulty, index].join(SEPARATOR)
}

export function isBotId(playerId: string): boolean {
    return parseBotId(playerId) !== null
}

/**
 * Renvoie null pour tout identifiant humain, y compris ceux qui commencent par
 * « bot » sans respecter la forme complete. Un joueur nomme `bot-truc` ou
 * `bot:` ne doit jamais etre pilote comme un bot.
 */
export function parseBotId(playerId: string): { difficulty: DifficultyId; index: number } | null {
    const parts = playerId.split(SEPARATOR)
    if (parts.length !== 3) return null
    const [prefix, difficulty, rawIndex] = parts
    if (prefix !== PREFIX) return null
    if (!(difficulty in BOT_LABELS)) return null
    if (!/^[0-9]+$/.test(rawIndex)) return null
    const index = Number(rawIndex)
    if (index < 1) return null
    return { difficulty: difficulty as DifficultyId, index }
}

/** Nom affiche dans le salon et dans la partie. */
export function botDisplayName(difficulty: DifficultyId, index: number): string {
    return `Bot ${BOT_LABELS[difficulty].toLowerCase()} ${index}`
}

/**
 * Prochain numero libre pour un niveau donne. Deux bots « Difficile » ne
 * peuvent pas porter le meme numero, meme apres qu'un bot intermediaire a ete
 * retire du salon.
 */
export function nextBotIndex(existingPlayerIds: string[], difficulty: DifficultyId): number {
    const used = new Set<number>()
    for (const id of existingPlayerIds) {
        const parsed = parseBotId(id)
        if (parsed && parsed.difficulty === difficulty) used.add(parsed.index)
    }
    let n = 1
    while (used.has(n)) n++
    return n
}
