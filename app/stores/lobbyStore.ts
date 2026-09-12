import { defineStore } from 'pinia'
import { botDisplayName, isBotId, makeBotId, nextBotIndex } from '~/utils/botIdentity'
import type { DifficultyId } from '~/composables/useBotPlayer'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface LobbyPlayer {
    playerId: string
    playerName: string
    seat: number
    isReady: boolean
}

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useLobbyStore = defineStore('lobby', {
    state: () => ({
        gameId: null as string | null,
        gameCode: null as string | null,
        gridId: '01' as string,
        turnDuration: 60 as number,
        localPlayerId: '' as string,
        localPlayerName: '' as string,
        players: [] as LobbyPlayer[],
        status: 'idle' as 'idle' | 'loading' | 'waiting' | 'starting' | 'playing',
        error: null as string | null,
        justStartedGame: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lobbyChannel: null as any,
    }),

    getters: {
        localPlayer: (state): LobbyPlayer | undefined =>
            state.players.find(p => p.playerId === state.localPlayerId),

        allReady: (state): boolean =>
            state.players.length > 0 && state.players.every(p => p.isReady),

        isHost: (state): boolean => {
            const player = state.players.find(p => p.playerId === state.localPlayerId)
            return player?.seat === 0
        },
    },

    actions: {
        // ── INIT ──────────────────────────────────────────────────────────────────

        /**
         * Récupère ou génère le localPlayerId depuis localStorage.
         * À appeler dans onMounted (pas en SSR).
         */
        init() {
            if (!process.client) return
            let id = localStorage.getItem('encore_player_id')
            if (!id) {
                id = crypto.randomUUID()
                localStorage.setItem('encore_player_id', id)
            }
            this.localPlayerId = id
        },

        // ── CREATE GAME ───────────────────────────────────────────────────────────

        async createGame(playerName: string, gridId: string = '01', turnDuration: number = 60): Promise<string> {
            this.status = 'loading'
            this.error = null
            this.localPlayerName = playerName
            this.gridId = gridId
            this.turnDuration = turnDuration

            const supabase = useSupabaseClient()

            // Générer un code unique — réessayer en cas de collision
            let code = ''
            let gameId = ''
            let attempts = 0

            while (attempts < 5) {
                code = Math.random().toString(36).slice(2, 8).toUpperCase()

                const { data, error } = await supabase
                    .from('games')
                    .insert({ code, status: 'waiting', grid_id: gridId, turn_duration: turnDuration })
                    .select('id')
                    .single()

                if (!error && data) {
                    gameId = data.id
                    break
                }

                // Erreur UNIQUE constraint → réessayer avec un autre code
                if (error?.code === '23505') {
                    attempts++
                    continue
                }

                // Autre erreur → on remonte
                this.error = error?.message ?? 'Erreur lors de la création de la partie'
                this.status = 'idle'
                throw new Error(this.error)
            }

            if (!gameId) {
                this.error = 'Impossible de générer un code unique. Réessaie.'
                this.status = 'idle'
                throw new Error(this.error)
            }

            // Insérer le joueur créateur (seat 0 = premier joueur actif)
            const { error: playerError } = await supabase
                .from('game_players')
                .insert({
                    game_id: gameId,
                    player_id: this.localPlayerId,
                    player_name: playerName,
                    seat: 0,
                    is_ready: false,
                })

            if (playerError) {
                this.error = playerError.message
                this.status = 'idle'
                throw new Error(this.error)
            }

            this.gameId = gameId
            this.gameCode = code
            this.status = 'waiting'

            await this.watchLobby(gameId)

            return code
        },

        // ── JOIN GAME ─────────────────────────────────────────────────────────────

        async joinGame(code: string, playerName: string): Promise<void> {
            this.status = 'loading'
            this.error = null
            this.localPlayerName = playerName

            const supabase = useSupabaseClient()

            // Récupérer la partie par code
            const { data: game, error: gameError } = await supabase
                .from('games')
                .select('id, status, max_players, grid_id, turn_duration')
                .eq('code', code.toUpperCase())
                .single()

            if (gameError || !game) {
                this.error = 'Partie introuvable. Vérifie le code.'
                this.status = 'idle'
                throw new Error(this.error)
            }

            if (game.status !== 'waiting') {
                this.error = 'Cette partie a déjà commencé ou est terminée.'
                this.status = 'idle'
                throw new Error(this.error)
            }

            // Vérifier le nombre de joueurs actuels
            const { count, error: countError } = await supabase
                .from('game_players')
                .select('*', { count: 'exact', head: true })
                .eq('game_id', game.id)

            if (countError) {
                this.error = countError.message
                this.status = 'idle'
                throw new Error(this.error)
            }

            if ((count ?? 0) >= game.max_players) {
                this.error = 'La partie est complète.'
                this.status = 'idle'
                throw new Error(this.error)
            }

            const seat = count ?? 0

            // Insérer le joueur
            const { error: playerError } = await supabase
                .from('game_players')
                .insert({
                    game_id: game.id,
                    player_id: this.localPlayerId,
                    player_name: playerName,
                    seat,
                    is_ready: false,
                })

            if (playerError) {
                this.error = playerError.message
                this.status = 'idle'
                throw new Error(this.error)
            }

            this.gameId = game.id
            this.gameCode = code.toUpperCase()
            this.gridId = game.grid_id ?? '01'
            this.turnDuration = game.turn_duration ?? 60
            this.status = 'waiting'

            await this.watchLobby(game.id)
        },

        // ── SET READY ─────────────────────────────────────────────────────────────

        async setReady(): Promise<void> {
            if (!this.gameId || !this.localPlayerId) return

            const supabase = useSupabaseClient()

            const { error } = await supabase
                .from('game_players')
                .update({ is_ready: true })
                .eq('game_id', this.gameId)
                .eq('player_id', this.localPlayerId)

            if (error) {
                this.error = error.message
                return
            }

            // Vérifier côté Supabase si tous les joueurs sont prêts
            const { data: allPlayers, error: fetchError } = await supabase
                .from('game_players')
                .select('is_ready')
                .eq('game_id', this.gameId)

            if (fetchError || !allPlayers) return

            const everyoneReady = allPlayers.length >= 2 && allPlayers.every(p => p.is_ready)

            if (everyoneReady) {
                await supabase
                    .from('games')
                    .update({ status: 'playing' })
                    .eq('id', this.gameId)

                this.justStartedGame = true
                this.status = 'playing'
                await navigateTo(`/game/${this.gameId}`)
            }
        },

        // ── BOTS ──────────────────────────────────────────────────────────────────

        /**
         * Ajoute un bot au salon. C'est une ligne `game_players` comme une autre,
         * reconnaissable a son `player_id` (voir `~/utils/botIdentity`).
         *
         * `is_ready: true` des l'insertion : un bot n'a personne pour cliquer
         * « Je suis pret ». La condition de demarrage, qui exige que tous les
         * joueurs soient prets, reste donc inchangee.
         *
         * L'occupation est relue juste avant l'insertion plutot que deduite de
         * `this.players` : seul l'etat serveur fait foi si deux clients agissent
         * en meme temps.
         */
        async addBot(difficulty: DifficultyId): Promise<void> {
            if (!this.gameId || !this.isHost) return

            const supabase = useSupabaseClient()

            const { data: game, error: gameError } = await supabase
                .from('games')
                .select('max_players, status')
                .eq('id', this.gameId)
                .single()

            if (gameError || !game) {
                this.error = gameError?.message ?? 'Partie introuvable.'
                return
            }

            if (game.status !== 'waiting') {
                this.error = 'La partie a déjà commencé.'
                return
            }

            const { data: rows, error: rowsError } = await supabase
                .from('game_players')
                .select('player_id, seat')
                .eq('game_id', this.gameId)

            if (rowsError || !rows) {
                this.error = rowsError?.message ?? 'Impossible de lire les joueurs.'
                return
            }

            if (rows.length >= (game.max_players ?? 6)) {
                this.error = 'La partie est complète.'
                return
            }

            const index = nextBotIndex(rows.map(r => r.player_id), difficulty)
            // Le siege suit le maximum et non le nombre de lignes : apres un
            // retrait, un comptage produirait un siege deja occupe.
            const seat = rows.reduce((max, r) => Math.max(max, r.seat), -1) + 1

            const { error } = await supabase
                .from('game_players')
                .insert({
                    game_id: this.gameId,
                    player_id: makeBotId(difficulty, index),
                    player_name: botDisplayName(difficulty, index),
                    seat,
                    is_ready: true,
                })

            if (error) {
                this.error = error.message
                return
            }

            this.error = null
        },

        /**
         * Retire un bot du salon. Refuse tout identifiant humain : la politique
         * RLS `gp_delete` est permissive, c'est donc ici que se trouve le garde-fou.
         */
        async removeBot(playerId: string): Promise<void> {
            if (!this.gameId || !this.isHost) return

            if (!isBotId(playerId)) {
                this.error = 'Seuls les bots peuvent être retirés.'
                return
            }

            const supabase = useSupabaseClient()

            const { error } = await supabase
                .from('game_players')
                .delete()
                .eq('game_id', this.gameId)
                .eq('player_id', playerId)

            if (error) {
                this.error = error.message
                return
            }

            this.error = null
        },

        // ── WATCH LOBBY ───────────────────────────────────────────────────────────

        async watchLobby(gameId: string): Promise<void> {
            const supabase = useSupabaseClient()

            // Charger l'état initial des joueurs
            const { data: initialPlayers } = await supabase
                .from('game_players')
                .select('player_id, player_name, seat, is_ready')
                .eq('game_id', gameId)
                .order('seat', { ascending: true })

            if (initialPlayers) {
                this.players = initialPlayers.map(p => ({
                    playerId: p.player_id,
                    playerName: p.player_name,
                    seat: p.seat,
                    isReady: p.is_ready,
                }))
            }

            // Écouter les changements en temps réel
            this.lobbyChannel = supabase
                .channel(`lobby:${gameId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'game_players',
                        filter: `game_id=eq.${gameId}`,
                    },
                    async () => {
                        const { data } = await supabase
                            .from('game_players')
                            .select('player_id, player_name, seat, is_ready')
                            .eq('game_id', gameId)
                            .order('seat', { ascending: true })

                        if (data) {
                            this.players = data.map(p => ({
                                playerId: p.player_id,
                                playerName: p.player_name,
                                seat: p.seat,
                                isReady: p.is_ready,
                            }))
                        }

                        // Si tous prêts et pas encore redirigé → démarrer
                        const everyoneReady = this.players.length >= 2 && this.players.every(p => p.isReady)
                        if (everyoneReady && this.status !== 'playing') {
                            this.justStartedGame = true
                            this.status = 'playing'
                            await navigateTo(`/game/${gameId}`)
                        }
                    }
                )
                .subscribe()
        },

        // ── LEAVE LOBBY ───────────────────────────────────────────────────────────

        leaveLobby(): void {
            const supabase = useSupabaseClient()
            if (this.lobbyChannel) {
                supabase.removeChannel(this.lobbyChannel)
            }
            this.gameId = null
            this.gameCode = null
            this.gridId = '01'
            this.turnDuration = 60
            this.players = []
            this.status = 'idle'
            this.error = null
            this.lobbyChannel = null
        },
    },
})