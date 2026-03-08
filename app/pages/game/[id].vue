<template>
  <div class="page">

    <!-- Header -->
    <header class="page-header">
      <div>
        <h1 class="page-title">ENCORE!</h1>
        <p class="page-subtitle">
          Tour {{ store.turnNumber + 1 }} · Joueur actif : <strong>{{ activePlayer?.name }}</strong>
        </p>
      </div>

      <!-- Indicateur connexion + timer -->
      <div class="header-right">
        <div class="timer" :class="{ 'timer--urgent': timer.secondsLeft.value <= 10 }">
          <div
            class="timer__bar"
            :style="{ width: `${(timer.secondsLeft.value / timer.totalDuration.value) * 100}%` }"
          />
          <span class="timer__label">{{ timer.secondsLeft.value }}s</span>
        </div>
        <div class="connection-dot" :class="sync.isReady.value ? 'connection-dot--online' : 'connection-dot--offline'" />
      </div>
    </header>

    <!-- Player tabs -->
    <div class="player-tabs">
      <button
        v-for="player in store.players"
        :key="player.id"
        class="player-tab"
        :class="{
          'player-tab--active': currentViewPlayer === player.id,
          'player-tab--is-active-player': store.activePlayerId === player.id,
          'player-tab--local': player.id === sync.localPlayerId.value,
        }"
        @click="currentViewPlayer = player.id"
      >
        <span v-if="store.activePlayerId === player.id" class="player-tab__crown">🎲</span>
        {{ player.name }}
        <span v-if="player.id === sync.localPlayerId.value" class="player-tab__you">toi</span>
        <span class="player-tab__score">{{ store.scoreForPlayer(player.id) }} pts</span>
      </button>
    </div>

    <!-- Layout principal -->
    <div class="main-layout">

      <!-- Panneau dés -->
      <div class="dice-section">
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
      </div>

      <!-- Board joueur -->
      <div v-if="viewedPlayer" class="board">

        <!-- Topbar -->
        <div class="board-topbar">
          <span class="board-player-name">{{ viewedPlayer.name }}</span>
          <div class="board-topbar__right">
            <div v-if="viewedPlayer.confirmedCombo" class="combo-badge">
              <span
                class="combo-badge__color"
                :style="{ background: COLOR_MAP[viewedPlayer.confirmedCombo.color as ColorKey]?.hex }"
              />
              <span class="combo-badge__count">× {{ viewedPlayer.confirmedCombo.count }}</span>
            </div>
            <GameJokers
              :total="store.grid.jokers"
              :used="viewedPlayer.jokersUsed"
              @use="isLocalPlayer && sync.dispatch('USE_JOKER', { playerId: viewedPlayer!.id })"
            />
          </div>
        </div>

        <!-- Grille -->
        <div class="board-grid">
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

        <!-- Bonus couleurs -->
        <div class="color-bonuses">
          <div
            v-for="(info, key) in COLOR_MAP"
            :key="key"
            class="color-chip"
          >
            <div class="color-chip__dot" :style="{ background: info.hex }" />
            <span
              class="color-chip__val color-chip__val--first"
              :class="{ 'color-chip__val--crossed': viewedPlayer.colorBonus[key as ColorKey] !== null }"
            >5</span>
            <span class="color-chip__sep">/</span>
            <span class="color-chip__val color-chip__val--others">3</span>
          </div>
        </div>

        <!-- Score -->
        <div class="score-panel">
          <div class="score-row">
            <span>BONUS couleurs</span>
            <span class="score-val">{{ colorBonusTotal }}</span>
          </div>
          <div class="score-row">
            <span>A→O colonnes</span>
            <span class="score-val">{{ columnTotal }}</span>
          </div>
          <div class="score-row">
            <span>! Jokers (+1)</span>
            <span class="score-val">{{ store.grid.jokers - viewedPlayer.jokersUsed }}</span>
          </div>
          <div class="score-row">
            <span>★ Étoiles (−2)</span>
            <span class="score-val score-val--negative">
              {{ store.gameOver ? `−${uncheckedStars * 2}` : '—' }}
            </span>
          </div>
          <div class="score-total">
            <span>TOTAL</span>
            <span class="score-total__val">{{ store.scoreForPlayer(viewedPlayer.id) }}</span>
          </div>
        </div>

      </div>
    </div>

    <!-- Auto passage au tour suivant -->
    <div v-if="store.phase === 'turn_end'" class="controls">
      <p class="auto-next-msg">Tour suivant dans quelques secondes...</p>
    </div>

    <!-- Game Over -->
    <div v-if="store.gameOver" class="game-over">
      <h2>🎉 Partie terminée !</h2>
      <div
        v-for="player in store.players"
        :key="player.id"
        class="game-over__player"
      >
        {{ player.name }} : <strong>{{ store.scoreForPlayer(player.id) }} pts</strong>
      </div>
    </div>

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

// ── Computed ──────────────────────────────────────────────────────────────────

const viewedPlayer = computed(() =>
  store.players.find(p => p.id === currentViewPlayer.value) ?? null
)

const isLocalPlayer = computed(() => currentViewPlayer.value === sync.localPlayerId.value)

const activePlayer = computed(() =>
  store.players.find(p => p.id === store.activePlayerId)
)

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

// ── Watchers ──────────────────────────────────────────────────────────────────

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

    // Si le joueur actif n'a pas encore confirmé ses dés → il passe
    const activePlayer = store.players.find(p => p.id === store.activePlayerId)
    if ((store.phase as string) === 'active_selecting' && activePlayer && !activePlayer.hasConfirmed) {
      sync.dispatch('PASS_ACTIVE', {})
    }

    // Forcer tous les joueurs passifs qui n'ont pas joué
    store.players
      .filter(p => p.id !== store.activePlayerId && !p.hasPlaced && !p.hasPassed)
      .forEach(p => sync.dispatch('PASS_PASSIVE', { playerId: p.id }))
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

  if (phase === 'turn_end') {
    timer.stop()
    currentViewPlayer.value = store.activePlayerId
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
  currentViewPlayer.value = sync.localPlayerId.value
}

function handleComboConfirmed(_colorIdx: number, _numberIdx: number) {
  // feedback futur
}

function handleNextTurn() {
  sync.dispatch('NEXT_TURN', {})
  currentViewPlayer.value = store.activePlayerId
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
  await sync.setup(gameId, lobby.localPlayerId, lobby.players)

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
  @apply min-h-screen flex flex-col items-center gap-6 py-8 px-4;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */

.page-header {
  @apply w-full max-w-5xl flex items-start justify-between;
}

.page-title {
  @apply text-4xl font-black tracking-tight;
  font-family: 'Space Mono', monospace;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.page-subtitle {
  @apply text-sm mt-1;
  color: #6e6e88;
}

.header-right {
  @apply flex items-center gap-3 mt-2;
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

/* ── Player tabs ─────────────────────────────────────────────────────────────── */

.player-tabs { @apply flex gap-2 flex-wrap justify-center; }

.player-tab {
  @apply flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
  color: #6e6e88;
}

.player-tab:hover { color: #e8e8f0; }
.player-tab--active { border-color: #f5d742; color: #f5d742; }
.player-tab--is-active-player { border-color: #5cc96e; }
.player-tab--active.player-tab--is-active-player { border-color: #f5d742; }
.player-tab__crown { @apply text-base; }

.player-tab__you {
  @apply text-xs px-1.5 py-0.5 rounded-full font-normal;
  background: rgba(245, 215, 66, 0.15);
  color: #f5d742;
}

.player-tab__score {
  @apply text-xs px-2 py-0.5 rounded-full;
  background: #23232f;
  color: #e8e8f0;
}

/* ── Layout ──────────────────────────────────────────────────────────────────── */

.main-layout { @apply w-full max-w-5xl flex flex-col gap-4; }
.dice-section { @apply w-full; }

.board {
  @apply w-full flex flex-col gap-4 p-5 rounded-2xl;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.board-topbar {
  @apply flex items-center justify-between flex-wrap gap-3;
}

.board-topbar__right {
  @apply flex items-center gap-3;
}

.board-player-name {
  @apply font-black text-lg;
  color: #f5d742;
}

.combo-badge {
  @apply flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm font-black;
  background: #23232f;
  border: 1px solid #3e3e52;
}

.combo-badge__color { @apply w-4 h-4 rounded-full inline-block; }
.combo-badge__count { color: #e8e8f0; }

.board-grid { @apply w-full overflow-x-auto; }

.color-bonuses { @apply flex gap-2 flex-wrap; }

.color-chip {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm;
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
  @apply flex flex-col gap-2 pt-3;
  border-top: 1px solid #2e2e3e;
}

.score-row {
  @apply flex justify-between items-center text-sm pb-2;
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
  @apply flex justify-between items-center font-black text-lg;
}

.score-total__val {
  font-family: 'Space Mono', monospace;
  color: #f5d742;
  @apply text-2xl;
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