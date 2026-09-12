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
        <!-- Badge vert si on est le joueur actif -->
        <span
          v-if="isLocalActivePlayer && store.phase === 'active_selecting'"
          class="badge-active-player"
        >🎲 Joueur actif</span>
        <!-- Nom + action de l'autre joueur actif -->
        <div v-else-if="activePlayer && !isLocalActivePlayer" class="active-phase-info">
          <span class="active-phase-info__name">{{ activePlayer.name }}</span>
          <span v-if="activePhaseInfo" class="active-phase-info__label">{{ activePhaseInfo }}</span>
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
                :class="{
                  'color-chip__val--done-first': viewedPlayer.colorBonus[key as ColorKey] === 'first',
                  'color-chip__val--done-others': viewedPlayer.colorBonus[key as ColorKey] === 'others'
                }"
              >5</span>
              <span class="color-chip__sep">/</span>
              <span
                class="color-chip__val color-chip__val--others"
                :class="{ 'color-chip__val--done-first': viewedPlayer.colorBonus[key as ColorKey] === 'others' }"
              >3</span>
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
          :columns-taken="columnsTaken"
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

    <!-- Auto passage au tour suivant (masqué si la partie est terminée) -->
    <div v-if="store.phase === 'turn_end' && !store.gameOver" class="controls">
      <p class="auto-next-msg">Tour suivant dans quelques secondes...</p>
    </div>

    <!-- Game Over (fallback texte) -->
    <div v-if="store.gameOver && store.phase !== 'turn_end'" class="game-over">
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

    <!-- Dernier coup (passifs quand le joueur actif termine la partie) -->
    <Teleport to="body">
      <Transition name="last-turn">
        <div v-if="showLastTurn" class="last-turn-banner">
          <span class="lt-flag">⚑</span>
          <span class="lt-text">DERNIER COUP !</span>
          <span class="lt-sub">Jouez votre dernier placement</span>
        </div>
      </Transition>
    </Teleport>

    <!-- Color completion -->
    <Teleport to="body">
      <ColorCompletionOverlay
        v-if="store.lastColorCompleted"
        :color="store.lastColorCompleted.color"
        :player-name="completedPlayerName"
        :status="completedBonusType"
        @done="store.popCompletionQueue()"
      />
    </Teleport>


    <!-- End game : turn_end + plus d'animations en cours -->
    <EndGameOverlay
      v-if="store.gameOver && store.phase === 'turn_end' && !store.lastColorCompleted"
      :players="endGamePlayers"
      :turn-number="store.turnNumber"
      :grid="store.grid"
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
const showLastTurn = ref(false)

// ── Computed ──────────────────────────────────────────────────────────────────

const viewedPlayer = computed(() =>
  store.players.find(p => p.id === currentViewPlayer.value) ?? null
)

// Colonnes finies en premier par un autre joueur (pour afficher rouge sur la grille du joueur courant)
const columnsTaken = computed(() => {
  const taken = new Set<string>()
  if (!viewedPlayer.value) return taken
  store.players.forEach(p => {
    if (p.id === viewedPlayer.value!.id) return
    Object.entries(p.columnBonus).forEach(([col, v]) => { if (v !== null) taken.add(col) })
  })
  return taken
})

const isLocalPlayer = computed(() => currentViewPlayer.value === sync.localPlayerId.value)
const isLocalActivePlayer = computed(() => sync.localPlayerId.value === store.activePlayerId)

const activePlayer = computed(() =>
  store.players.find(p => p.id === store.activePlayerId)
)

const activePhaseInfo = computed(() => {
  if (store.phase === 'waiting_roll') return 'lance les dés...'
  if (store.phase === 'active_selecting') return 'fait sa sélection'
  if (store.phase === 'passive_selecting') return 'a joué — à vous'
  if (store.phase === 'turn_end') return 'tour suivant...'
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
    colorBonus: p.colorBonus,
    columnBonus: p.columnBonus,
    jokers: store.grid.jokers - p.jokersUsed,
    starMalus: store.grid.cells.filter(([_, star], idx) =>
      star && !p.checkedCells.has(idx)
    ).length * -2,
    checkedCells: Array.from(p.checkedCells),
  }))
)

const completedPlayerName = computed(() => {
  const playerId = store.lastColorCompleted?.playerId
  return store.players.find(p => p.id === playerId)?.name ?? ''
})

// 'first' ou 'others' pour afficher +5 ou +3 dans l'overlay de complétion couleur
const completedBonusType = computed((): 'first' | 'others' => {
  const item = store.lastColorCompleted
  if (!item) return 'first'
  const player = store.players.find(p => p.id === item.playerId)
  return player?.colorBonus[item.color as ColorKey] ?? 'first'
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

    // La raison voyage avec l'action : c'est elle qui permet d'afficher
    // "temps ecoule" plutot que de laisser croire a un bug.
    if (store.isFirstThreeTurns) {
      // Tours 1–3 : passer tous ceux qui n'ont pas joué
      store.players
        .filter(p => !p.hasPlaced && !p.hasPassed)
        .forEach(p => sync.dispatch('PASS_PASSIVE', { playerId: p.id, reason: 'timer' }))
    } else if ((store.phase as string) === 'active_selecting') {
      // Seulement passer le joueur actif — les passifs jouent ensuite
      const ap = store.players.find(p => p.id === store.activePlayerId)
      if (ap && !ap.hasConfirmed) {
        sync.dispatch('PASS_ACTIVE', { reason: 'timer' })
      }
      // NE PAS passer les joueurs passifs ici — ils auront leur propre timer
    } else if ((store.phase as string) === 'passive_selecting') {
      // Timer passif expiré : passer tous ceux qui n'ont pas encore joué
      store.players
        .filter(p => p.id !== store.activePlayerId && !p.hasPlaced && !p.hasPassed)
        .forEach(p => sync.dispatch('PASS_PASSIVE', { playerId: p.id, reason: 'timer' }))
    }
  })
}

// ── Watcher gameOver ─────────────────────────────────────────────────────────

watch(() => store.gameOver, (isOver) => {
  if (!isOver) return
  // Broadcast explicite pour éviter la race condition NEXT_TURN vs CONFIRM_PLACEMENT
  if (sync.localPlayerId.value === store.activePlayerId) {
    sync.dispatch('GAME_OVER', {})
  }
  // Afficher "Dernier coup" aux joueurs passifs si la partie n'est pas encore terminée
  if (sync.localPlayerId.value !== store.activePlayerId && store.phase !== 'turn_end') {
    showLastTurn.value = true
    setTimeout(() => { showLastTurn.value = false }, 1000)
  }
})

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
    // Auto passage au tour suivant après 1.5 secondes (joueur actif seulement)
    if (sync.localPlayerId.value === store.activePlayerId) {
      setTimeout(() => {
        if ((store.phase as string) === 'turn_end') {
          handleNextTurn()
        }
      }, 1500)
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
  const isFirstStart = lobby.justStartedGame
  isReconnecting.value = !isFirstStart   // pas de loader sur premier lancement
  loaderReady.value = false
  await sync.setup(gameId, lobby.localPlayerId, lobby.players)
  loaderReady.value = true

  // Premier lancement : animation de lancement uniquement (pas le loader)
  if (isFirstStart) {
    showLaunchAnim.value = true
    lobby.justStartedGame = false
    isReconnecting.value = false
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
  position: relative;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */

.page-header {
  @apply w-full flex items-center justify-between gap-4;
  /* Alignee sur .main-layout : un header plus etroit que le plateau se voyait. */
  max-width: min(1760px, 100%);
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

.badge-active-player {
  @apply text-xs font-bold px-3 py-1 rounded-full;
  background: rgba(92, 201, 110, 0.15);
  color: #5cc96e;
  border: 1px solid rgba(92, 201, 110, 0.3);
  white-space: nowrap;
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
  max-width: min(1760px, 100%);
  align-items: flex-start;
}

.main-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 340px;
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
  padding-bottom: 4px;
  overflow: visible;
}

.color-chip {
  @apply flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs;
  background: #23232f;
  border: 1px solid #2e2e3e;
  overflow: visible;
}

.color-chip__dot { @apply w-3 h-3 rounded-full; }
.color-chip__val { @apply font-black; font-family: 'Space Mono', monospace; }
.color-chip__val--first { color: #5cc96e; }
.color-chip__val--others { color: #6e6e88; }
.color-chip__val--done-first {
  position: relative;
  box-shadow: 0 0 0 2px #5cc96e;
  border-radius: 3px;
  animation: chip-circle-green 0.35s ease-out;
}
@keyframes chip-circle-green {
  from { box-shadow: 0 0 0 0px #5cc96e; opacity: 0.4; }
  to   { box-shadow: 0 0 0 2px #5cc96e; opacity: 1; }
}

.color-chip__val--done-others {
  position: relative;
  color: #e85a82;
  box-shadow: 0 0 0 2px #e85a82;
  border-radius: 3px;
  opacity: 0.65;
  animation: chip-circle-red 0.35s ease-out;
}
@keyframes chip-circle-red {
  from { box-shadow: 0 0 0 0px #e85a82; opacity: 0.3; }
  to   { box-shadow: 0 0 0 2px #e85a82; opacity: 0.65; }
}
.color-chip__val--done-others::before,
.color-chip__val--done-others::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 1.5px;
  background: #e85a82;
  pointer-events: none;
}
.color-chip__val--done-others::before {
  animation: chip-cross-1 0.2s ease-out 0.15s both;
}
.color-chip__val--done-others::after {
  animation: chip-cross-2 0.2s ease-out 0.25s both;
}
@keyframes chip-cross-1 {
  from { transform: translate(-50%, -50%) rotate(45deg) scaleX(0); }
  to   { transform: translate(-50%, -50%) rotate(45deg) scaleX(1); }
}
@keyframes chip-cross-2 {
  from { transform: translate(-50%, -50%) rotate(-45deg) scaleX(0); }
  to   { transform: translate(-50%, -50%) rotate(-45deg) scaleX(1); }
}
.color-chip__sep { color: #6e6e88; }

.score-panel {
  @apply flex flex-col gap-1 pt-2;
  border-top: 1px solid #2e2e3e;
}

.score-row {
  @apply flex justify-between items-center pb-1;
  border-bottom: 1px solid #2e2e3e;
  font-size: 11px;
  color: #e8e8f0;
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

/* ── Dernier coup banner ──────────────────────────────────────────────────── */
.last-turn-banner {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9990;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px 36px;
  background: rgba(15, 15, 19, 0.96);
  border: 2px solid #e85a82;
  border-radius: 16px;
  box-shadow: 0 0 40px rgba(232, 90, 130, 0.35);
  pointer-events: none;
  text-align: center;
}
.lt-flag {
  font-size: 28px;
  color: #e85a82;
}
.lt-text {
  font-family: 'Space Mono', monospace;
  font-size: 22px;
  font-weight: 700;
  color: #e85a82;
  letter-spacing: 0.08em;
}
.lt-sub {
  font-family: 'Nunito', sans-serif;
  font-size: 13px;
  color: #9a9ab0;
}

.last-turn-enter-active { animation: lt-in 0.4s ease; }
.last-turn-leave-active { animation: lt-out 0.4s ease forwards; }
@keyframes lt-in {
  from { opacity: 0; transform: translate(-50%, -60%) scale(0.88); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes lt-out {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to   { opacity: 0; transform: translate(-50%, -40%) scale(0.92); }
}
</style>