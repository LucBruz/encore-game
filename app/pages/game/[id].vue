<template>
  <div class="page">

    <!-- Header -->
    <header class="page-header">
      <!-- Gauche : titre -->
      <h1 class="page-title">ENCORE!</h1>

      <!-- Centre : chips joueurs -->
      <div class="header-players">
        <button
          v-for="player in store.players"
          :key="player.id"
          class="player-chip"
          :class="{
            'player-chip--active': currentViewPlayer === player.id,
            'player-chip--is-active-player': store.activePlayerId === player.id,
            'player-chip--local': player.id === sync.localPlayerId.value,
          }"
          @click="currentViewPlayer = player.id"
        >
          <span v-if="store.activePlayerId === player.id" class="player-chip__dice">🎲</span>
          {{ player.name }}
          <span v-if="player.id === sync.localPlayerId.value" class="player-chip__you">toi</span>
          <span class="player-chip__score">{{ store.scoreForPlayer(player.id) }} pts</span>
        </button>
      </div>

      <!-- Droite : joueur actif + timer + dot -->
      <div class="header-right">
        <div v-if="activePlayer && activePhaseInfo" class="active-phase-info">
          <span class="active-phase-info__name">{{ activePlayer.name }}</span>
          <span class="active-phase-info__label">{{ activePhaseInfo }}</span>
        </div>
        <div class="timer-block">
          <div class="timer" :class="{ 'timer--urgent': timer.secondsLeft.value <= 10 }">
            <div
              class="timer__bar"
              :style="{ width: `${(timer.secondsLeft.value / timer.totalDuration.value) * 100}%` }"
            />
            <span class="timer__label">{{ timer.secondsLeft.value }}s</span>
          </div>
          <span v-if="store.isFirstThreeTurns" class="badge-early-turns">⚡ Tours 1–3</span>
        </div>
        <div class="connection-dot" :class="sync.isReady.value ? 'connection-dot--online' : 'connection-dot--offline'" />
      </div>
    </header>

    <!-- Layout principal : gauche = dés + infos, droite = grille -->
    <div class="main-layout">

      <!-- Colonne gauche -->
      <div class="main-left">

        <!-- Panneau dés -->
        <GameDices
          :player-id="currentViewPlayer"
          :readonly="!isLocalPlayer"
          @pass="handlePass"
          @combo-confirmed="handleComboConfirmed"
          @switch-to-player="(id) => currentViewPlayer = id"
          @roll="(roll) => sync.dispatch('ROLL_DICES', { roll })"
          @confirm-active="(ci, ni, jc, jn) => sync.dispatch('CONFIRM_ACTIVE', { colorDiceIndex: ci, numberDiceIndex: ni, jokerColor: jc, jokerCount: jn })"
          @confirm-passive="(pid, ci, ni, jc, jn) => sync.dispatch('CONFIRM_PASSIVE', { playerId: pid, colorDiceIndex: ci, numberDiceIndex: ni, jokerColor: jc, jokerCount: jn })"
          @pass-active="sync.dispatch('PASS_ACTIVE', {})"
          @pass-passive="(pid) => sync.dispatch('PASS_PASSIVE', { playerId: pid })"
        />

        <!-- Infos joueur : nom, combo, jokers, bonus, score -->
        <div v-if="viewedPlayer" class="board-info">
          <div class="board-info-top">
            <span class="board-player-name">{{ viewedPlayer.name }}</span>
            <div v-if="viewedPlayer.confirmedCombo" class="combo-badge">
              <span
                class="combo-badge__color"
                :style="{ background: COLOR_MAP[viewedPlayer.confirmedCombo.color as ColorKey]?.hex }"
              />
              <span class="combo-badge__count">× {{ viewedPlayer.confirmedCombo.count }}</span>
            </div>
          </div>

          <GameJokers
            :total="store.grid.jokers"
            :used="viewedPlayer.jokersUsed"
          />

          <div class="color-bonuses">
            <div v-for="(info, key) in COLOR_MAP" :key="key" class="color-chip">
              <div class="color-chip__dot" :style="{ background: info.hex }" />
              <span
                class="color-chip__val color-chip__val--first"
                :class="{ 'color-chip__val--crossed': viewedPlayer.colorBonus[key as ColorKey] !== null }"
              >5</span>
              <span class="color-chip__sep">/</span>
              <span class="color-chip__val color-chip__val--others">3</span>
            </div>
          </div>

          <div class="score-panel">
            <div class="score-row"><span>Couleurs</span><span class="score-val">{{ colorBonusTotal }}</span></div>
            <div class="score-row"><span>Colonnes</span><span class="score-val">{{ columnTotal }}</span></div>
            <div class="score-row"><span>Jokers</span><span class="score-val">{{ store.grid.jokers - viewedPlayer.jokersUsed }}</span></div>
            <div class="score-row">
              <span>Étoiles</span>
              <span class="score-val score-val--negative">{{ store.gameOver ? `−${uncheckedStars * 2}` : '—' }}</span>
            </div>
            <div class="score-total"><span>TOTAL</span><span class="score-total__val">{{ store.scoreForPlayer(viewedPlayer.id) }}</span></div>
          </div>
        </div>

      </div>

      <!-- Colonne droite : grille seule -->
      <div v-if="viewedPlayer" class="main-right">
        <GameGrid
          :grid="store.grid"
          :checked-cells="viewedPlayer.checkedCells"
          :pending-cells="viewedPlayer.pendingCells"
          :valid-cells="store.validCellsForPlayer(viewedPlayer.id)"
          :column-bonus="viewedPlayer.columnBonus"
          :confirmed-combo="viewedPlayer.confirmedCombo"
          :placement-error="store.placementError"
          :is-blocked-mode="!!viewedPlayer.confirmedCombo && !viewedPlayer.hasPlaced"
          :readonly="!isLocalPlayer"
          @cell-click="(idx) => sync.dispatch('TOGGLE_CELL', { playerId: viewedPlayer!.id, cellIdx: idx })"
          @confirm-placement="sync.dispatch('CONFIRM_PLACEMENT', { playerId: viewedPlayer!.id })"
          @cancel-placement="sync.dispatch('CANCEL_PLACEMENT', { playerId: viewedPlayer!.id })"
        />
      </div>

    </div>

    <!-- Auto passage au tour suivant -->
    <div v-if="store.phase === 'turn_end'" class="controls">
      <p class="auto-next-msg">Tour suivant dans quelques secondes...</p>
    </div>

    <!-- Game Over (fallback texte) -->
    <div v-if="store.gameOver && !showEndGame" class="game-over">
      <h2>🎉 Partie terminée !</h2>
      <div
        v-for="player in store.players"
        :key="player.id"
        class="game-over__player"
      >
        {{ player.name }} : <strong>{{ store.scoreForPlayer(player.id) }} pts</strong>
      </div>
    </div>

    <!-- Loader reconnexion : se termine dès que sync est prêt -->
    <LoaderScreen
      v-if="isReconnecting"
      subtitle="Connexion à la partie..."
      :duration="4000"
      :ready="loaderReady"
      @done="isReconnecting = false"
    />

    <!-- Launch overlay (première fois) -->
    <LaunchOverlay
      v-if="showLaunchAnim"
      :player-name="lobby.localPlayerName ?? 'Joueur'"
      @done="showLaunchAnim = false"
    />

    <!-- Color completion -->
    <ColorCompletionOverlay
      v-if="store.lastColorCompleted"
      :color="store.lastColorCompleted.color"
      :player-name="completedPlayerName"
      @done="store.clearLastColorCompleted()"
    />

    <!-- End game -->
    <EndGameOverlay
      v-if="store.gameOver && showEndGame"
      :players="endGamePlayers"
      @replay="handleReplay"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useGameStore, rollAllDices } from '~/stores/gameStore'
import { useLobbyStore } from '~/stores/lobbyStore'
import { useGameSync } from '~/composables/Usegamesync'
import { useTurnTimer } from '~/composables/Useturntimer'
import { COLOR_MAP, COLUMN_POINTS } from '~/data/grids/grid-01'
import type { ColorKey } from '~/data/grids/grid-01'

const route = useRoute()
const store = useGameStore()
const lobby = useLobbyStore()
const sync = useGameSync()
const timer = useTurnTimer()

const currentViewPlayer = ref('')
const isReconnecting = ref(true)
const loaderReady = ref(false)
const showLaunchAnim = ref(false)
const showEndGame = ref(false)

// ── Computed ──────────────────────────────────────────────────────────────────

const viewedPlayer = computed(() =>
  store.players.find(p => p.id === currentViewPlayer.value) ?? null
)

const isLocalPlayer = computed(() => currentViewPlayer.value === sync.localPlayerId.value)

const activePlayer = computed(() =>
  store.players.find(p => p.id === store.activePlayerId)
)

const activePhaseInfo = computed(() => {
  if (store.phase === 'waiting_roll') return 'lance les dés...'
  if (store.phase === 'active_selecting') return 'fait sa sélection'
  return null
})

const colorBonusTotal = computed(() => {
  if (!viewedPlayer.value) return 0
  return Object.values(viewedPlayer.value.colorBonus).reduce((acc, v) => {
    return acc + (v === 'first' ? 5 : v === 'others' ? 3 : 0)
  }, 0)
})

const columnTotal = computed(() => {
  if (!viewedPlayer.value) return 0
  return Object.entries(viewedPlayer.value.columnBonus).reduce((acc, [col, v]) => {
    if (v === 'first') return acc + (COLUMN_POINTS[col]?.first ?? 0)
    if (v === 'others') return acc + (COLUMN_POINTS[col]?.others ?? 0)
    return acc
  }, 0)
})

const uncheckedStars = computed(() => {
  if (!viewedPlayer.value) return 0
  return store.grid.cells.filter(([_, star], idx) =>
    star && !viewedPlayer.value!.checkedCells.has(idx)
  ).length
})

const endGamePlayers = computed(() =>
  store.players.map(p => ({
    name: p.name,
    isLocal: p.id === lobby.localPlayerId,
    score: store.scoreForPlayer(p.id),
    colors: Object.values(p.colorBonus).filter(v => v !== null).length,
    columns: Object.values(p.columnBonus).filter(v => v !== null).length,
    jokers: p.jokersUsed ?? 0,
    stars: 0,
  }))
)

const completedPlayerName = computed(() => {
  const playerId = store.lastColorCompleted?.playerId
  return store.players.find(p => p.id === playerId)?.name ?? ''
})

// ── Watchers ──────────────────────────────────────────────────────────────────

watch(() => store.gameOver, (val) => {
  if (val) showEndGame.value = true
})

// ── Roll timer (auto-roll après 15s si le joueur actif ne lance pas) ──────────

let rollTimerId: ReturnType<typeof setTimeout> | null = null

function startRollTimer() {
  if (rollTimerId) clearTimeout(rollTimerId)
  rollTimerId = setTimeout(() => {
    rollTimerId = null
    if ((store.phase as string) === 'waiting_roll' && sync.localPlayerId.value === store.activePlayerId) {
      const roll = rollAllDices()
      sync.dispatch('ROLL_DICES', { roll })
    }
  }, 15000)
}

function stopRollTimer() {
  if (rollTimerId) { clearTimeout(rollTimerId); rollTimerId = null }
}

// ── Turn timer ────────────────────────────────────────────────────────────────

function startTimer() {
  timer.start(lobby.turnDuration, () => {
    if (sync.localPlayerId.value !== store.activePlayerId) return

    if (store.isFirstThreeTurns) {
      // Tours 1–3 : passer tous ceux qui n'ont pas joué
      store.players
        .filter(p => !p.hasPlaced && !p.hasPassed)
        .forEach(p => sync.dispatch('PASS_PASSIVE', { playerId: p.id }))
    } else if ((store.phase as string) === 'active_selecting') {
      // Seulement passer le joueur actif — les passifs jouent ensuite
      const ap = store.players.find(p => p.id === store.activePlayerId)
      if (ap && !ap.hasConfirmed) {
        sync.dispatch('PASS_ACTIVE', {})
      }
      // NE PAS passer les joueurs passifs ici — ils auront leur propre timer
    } else if ((store.phase as string) === 'passive_selecting') {
      // Timer passif expiré : passer tous ceux qui n'ont pas encore joué
      store.players
        .filter(p => p.id !== store.activePlayerId && !p.hasPlaced && !p.hasPassed)
        .forEach(p => sync.dispatch('PASS_PASSIVE', { playerId: p.id }))
    }
  })
}

// ── Watcher phases ────────────────────────────────────────────────────────────

watch(() => store.phase, (phase) => {
  stopRollTimer()

  if (phase === 'waiting_roll') {
    timer.stop()
    if (sync.localPlayerId.value === store.activePlayerId) {
      startRollTimer()
    }
  }

  if (phase === 'active_selecting') {
    startTimer()
  }

  if (phase === 'passive_selecting') {
    startTimer()
  }

  if (phase === 'turn_end') {
    timer.stop()
    // Auto passage au tour suivant après 3 secondes (joueur actif seulement)
    if (sync.localPlayerId.value === store.activePlayerId) {
      setTimeout(() => {
        if ((store.phase as string) === 'turn_end') {
          handleNextTurn()
        }
      }, 3000)
    }
  }
}, { immediate: false })

// ── Handlers ─────────────────────────────────────────────────────────────────

function handlePass() {
}

function handleComboConfirmed(_colorIdx: number, _numberIdx: number) {
  // feedback futur
}

function handleNextTurn() {
  sync.dispatch('NEXT_TURN', {})
}

function handleReplay() {
  navigateTo('/')
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  const gameId = route.params.id as string

  // Reconstitution après refresh : lobby vide mais player_id en localStorage
  if (!lobby.players.length) {
    lobby.init() // charge le localPlayerId depuis localStorage
    if (!lobby.localPlayerId) {
      await navigateTo('/')
      return
    }
    const supabase = useSupabaseClient()

    const [{ data: players }, { data: game }] = await Promise.all([
      supabase
        .from('game_players')
        .select('player_id, player_name, seat, is_ready')
        .eq('game_id', gameId)
        .order('seat', { ascending: true }),
      supabase
        .from('games')
        .select('grid_id, turn_duration')
        .eq('id', gameId)
        .single(),
    ])

    if (!players?.length) {
      await navigateTo('/')
      return
    }

    // Vérifier que ce joueur fait bien partie de la partie
    const isParticipant = players.some(p => p.player_id === lobby.localPlayerId)
    if (!isParticipant) {
      await navigateTo('/')
      return
    }

    lobby.gameId = gameId
    lobby.gridId = game?.grid_id ?? '01'
    lobby.turnDuration = game?.turn_duration ?? 60
    lobby.players = players.map(p => ({
      playerId: p.player_id,
      playerName: p.player_name,
      seat: p.seat,
      isReady: p.is_ready,
    }))
  }

  // Charger la grille sélectionnée
  store.initGrid(lobby.gridId)

  // Init sync (store + canal + replay)
  isReconnecting.value = true
  loaderReady.value = false
  await sync.setup(gameId, lobby.localPlayerId, lobby.players)
  loaderReady.value = true

  // Distinguer premier lancement vs reconnexion
  if (lobby.justStartedGame) {
    showLaunchAnim.value = true
    lobby.justStartedGame = false
  }

  // Positionner la vue sur le joueur local
  currentViewPlayer.value = lobby.localPlayerId

  // Si le replay a restauré une phase intermédiaire, reprendre les timers
  if ((store.phase as string) === 'waiting_roll' && sync.localPlayerId.value === store.activePlayerId) {
    startRollTimer()
  }
  if ((store.phase as string) === 'active_selecting') {
    startTimer()
  }
})

onUnmounted(async () => {
  timer.stop()
  stopRollTimer()
  await sync.teardown()
})
</script>

<style scoped>
.page {
  @apply min-h-screen flex flex-col items-center gap-3 py-4 px-4;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */

.page-header {
  @apply w-full max-w-5xl flex items-center justify-between gap-4;
}

.page-title {
  @apply text-4xl font-black tracking-tight;
  font-family: 'Space Mono', monospace;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-players {
  @apply flex items-center gap-2 flex-wrap justify-center flex-1;
}

.player-chip {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
  color: #6e6e88;
}
.player-chip:hover { color: #e8e8f0; }
.player-chip--active { border-color: #f5d742; color: #f5d742; }
.player-chip--is-active-player { border-color: #5cc96e; }
.player-chip--active.player-chip--is-active-player { border-color: #f5d742; }
.player-chip__dice { @apply text-sm; }
.player-chip__you {
  @apply text-xs px-1 py-0.5 rounded-full font-normal;
  background: rgba(245, 215, 66, 0.15);
  color: #f5d742;
}
.player-chip__score {
  @apply text-xs px-1.5 py-0.5 rounded-full;
  background: #23232f;
  color: #e8e8f0;
}

.header-right {
  @apply flex items-center gap-3;
}

.active-phase-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.active-phase-info__name {
  font-size: 12px;
  font-weight: 900;
  font-family: 'Space Mono', monospace;
  color: #f5d742;
  white-space: nowrap;
}

.active-phase-info__label {
  font-size: 10px;
  color: #6e6e88;
  white-space: nowrap;
}

.timer-block {
  @apply flex flex-col items-center gap-1;
}

.badge-early-turns {
  @apply text-xs font-bold px-2 py-0.5 rounded-full;
  background: rgba(245, 215, 66, 0.15);
  color: #f5d742;
  border: 1px solid rgba(245, 215, 66, 0.3);
}

/* ── Timer ───────────────────────────────────────────────────────────────────── */

.timer {
  @apply relative flex items-center rounded-full overflow-hidden;
  width: 120px;
  height: 24px;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.timer__bar {
  @apply absolute left-0 top-0 h-full transition-all;
  background: linear-gradient(90deg, #5cc96e, #f5d742);
  transition: width 1s linear;
}

.timer--urgent .timer__bar {
  background: linear-gradient(90deg, #e85a82, #f58a35);
}

.timer__label {
  @apply relative z-10 w-full text-center text-xs font-black;
  font-family: 'Space Mono', monospace;
  color: #e8e8f0;
}

/* ── Connexion dot ───────────────────────────────────────────────────────────── */

.connection-dot {
  @apply w-2.5 h-2.5 rounded-full;
}

.connection-dot--online { background: #5cc96e; }
.connection-dot--offline {
  background: #e85a82;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ── Layout ──────────────────────────────────────────────────────────────────── */

.main-layout {
  display: flex;
  flex-direction: row;
  gap: 16px;
  width: 100%;
  max-width: 1400px;
  align-items: flex-start;
}

.main-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 300px;
  flex-shrink: 0;
}

.main-right {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.board-info {
  @apply flex flex-col gap-2 p-3 rounded-2xl;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.board-info-top {
  @apply flex items-center justify-between gap-2;
}

.board-player-name {
  @apply font-black text-sm;
  color: #f5d742;
}

.combo-badge {
  @apply flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm font-black;
  background: #23232f;
  border: 1px solid #3e3e52;
}

.combo-badge__color { @apply w-4 h-4 rounded-full inline-block; }
.combo-badge__count { color: #e8e8f0; }


.color-bonuses {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.color-chip {
  @apply flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs;
  background: #23232f;
  border: 1px solid #2e2e3e;
}

.color-chip__dot { @apply w-3 h-3 rounded-full; }
.color-chip__val { @apply font-black; font-family: 'Space Mono', monospace; }
.color-chip__val--first { color: #5cc96e; }
.color-chip__val--others { color: #6e6e88; }
.color-chip__val--crossed { @apply line-through opacity-40; }
.color-chip__sep { color: #6e6e88; }

.score-panel {
  @apply flex flex-col gap-1 pt-2;
  border-top: 1px solid #2e2e3e;
}

.score-row {
  @apply flex justify-between items-center text-xs pb-1;
  border-bottom: 1px solid #2e2e3e;
  color: #6e6e88;
}

.score-val {
  @apply font-black;
  font-family: 'Space Mono', monospace;
  color: #e8e8f0;
}

.score-val--negative { color: #e85a82; }

.score-total {
  @apply flex justify-between items-center font-black text-base;
}

.score-total__val {
  font-family: 'Space Mono', monospace;
  color: #f5d742;
  @apply text-xl;
}

/* ── Controls ────────────────────────────────────────────────────────────────── */

.controls { @apply flex gap-3 flex-wrap justify-center; }

.auto-next-msg {
  @apply text-sm text-center py-2 px-4 rounded-xl;
  color: #6e6e88;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
  animation: pulse-text 1.5s ease-in-out infinite;
}

@keyframes pulse-text {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.btn {
  @apply px-5 py-2 rounded-xl font-bold text-sm cursor-pointer transition-all;
  border: none;
}

.btn--primary {
  background: linear-gradient(135deg, #f5d742, #f58a35);
  color: #0f0f13;
}

.btn--primary:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.btn--primary:disabled { @apply opacity-40 cursor-not-allowed; }

/* ── Game Over ───────────────────────────────────────────────────────────────── */

.game-over {
  @apply text-center p-8 rounded-2xl;
  background: #1a1a24;
  border: 1px solid #f5d742;
}

.game-over h2 { @apply text-2xl font-black mb-4; }
.game-over__player { @apply text-lg py-1; }
</style>