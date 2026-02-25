<template>
  <div class="page">

    <!-- Header -->
    <header class="page-header">
      <h1 class="page-title">ENCORE!</h1>
      <p class="page-subtitle">Tour {{ store.turnNumber + 1 }} · {{ store.isFirstThreeTurns ? '⚡ 3 premiers tours — tous les dés disponibles' : '' }}</p>
    </header>

    <!-- Player tabs -->
    <div class="player-tabs">
      <button
        v-for="player in store.players"
        :key="player.id"
        class="player-tab"
        :class="{ 'player-tab--active': currentViewPlayer === player.id }"
        @click="currentViewPlayer = player.id"
      >
        {{ player.name }}
        <span class="player-tab__score">{{ store.scoreForPlayer(player.id) }} pts</span>
      </button>

      <button class="player-tab player-tab--add" @click="addPlayer">
        + Joueur
      </button>
    </div>

    <!-- Board -->
    <div v-if="viewedPlayer" class="board">

      <!-- Jokers -->
      <div class="board-topbar">
        <span class="board-player-name">{{ viewedPlayer.name }}</span>
        <GameJokers
          :total="store.grid.jokers"
          :used="viewedPlayer.jokersUsed"
          @use="store.useJoker(viewedPlayer.id)"
        />
      </div>

      <!-- Grille -->
      <div class="board-grid">
        <GameGrid
          :grid="store.grid"
          :checked-cells="viewedPlayer.checkedCells"
          :column-bonus="viewedPlayer.columnBonus"
          @cell-click="(idx) => store.toggleCell(viewedPlayer!.id, idx)"
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
          <span class="score-val score-val--negative">−{{ uncheckedStars * 2 }}</span>
        </div>
        <div class="score-total">
          <span>TOTAL</span>
          <span class="score-total__val">{{ store.scoreForPlayer(viewedPlayer.id) }}</span>
        </div>
      </div>

    </div>

    <!-- Controls -->
    <div class="controls">
      <button class="btn btn--primary" @click="store.nextTurn()">Tour suivant →</button>
      <button class="btn btn--ghost" @click="store.resetGame()">↺ Reset</button>
    </div>

    <!-- Game Over -->
    <div v-if="store.gameOver" class="game-over">
      <h2>🎉 Partie terminée !</h2>
      <div v-for="player in store.players" :key="player.id" class="game-over__player">
        {{ player.name }} : <strong>{{ store.scoreForPlayer(player.id) }} pts</strong>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '~/stores/gameStore'
import { COLOR_MAP } from '~/data/grids/grid-01'
import type { ColorKey } from '~/data/grids/grid-01'

const store = useGameStore()

const currentViewPlayer = ref(store.players[0].id)

const viewedPlayer = computed(() =>
  store.players.find(p => p.id === currentViewPlayer.value) ?? null
)

function addPlayer() {
  const name = `Joueur ${store.players.length + 1}`
  store.addPlayer(name)
}

const colorBonusTotal = computed(() => {
  if (!viewedPlayer.value) return 0
  return Object.values(viewedPlayer.value.colorBonus).reduce((acc, v) => {
    return acc + (v === 'first' ? 5 : v === 'others' ? 3 : 0)
  }, 0)
})

const columnTotal = computed(() => {
  if (!viewedPlayer.value) return 0
  return Object.entries(viewedPlayer.value.columnBonus).reduce((acc, [col, v]) => {
    if (v === 'first') return acc + (store.grid.columnPoints[col]?.first ?? 0)
    if (v === 'others') return acc + (store.grid.columnPoints[col]?.others ?? 0)
    return acc
  }, 0)
})

const uncheckedStars = computed(() => {
  if (!viewedPlayer.value) return 0
  return store.grid.cells.filter(([_, star], idx) =>
    star && !viewedPlayer.value!.checkedCells.has(idx)
  ).length
})
</script>

<style scoped>
.page {
  @apply min-h-screen flex flex-col items-center gap-6 py-8 px-4;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

.page-header { @apply text-center; }

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

/* Tabs */
.player-tabs {
  @apply flex gap-2 flex-wrap justify-center;
}

.player-tab {
  @apply flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
  color: #6e6e88;
  cursor: pointer;
}

.player-tab:hover { color: #e8e8f0; }

.player-tab--active {
  border-color: #f5d742;
  color: #f5d742;
}

.player-tab__score {
  @apply text-xs px-2 py-0.5 rounded-full;
  background: #23232f;
  color: #e8e8f0;
}

.player-tab--add {
  border-style: dashed;
}

/* Board */
.board {
  @apply w-full max-w-4xl flex flex-col gap-4 p-5 rounded-2xl;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.board-topbar {
  @apply flex items-center justify-between flex-wrap gap-3;
}

.board-player-name {
  @apply font-black text-lg;
  color: #f5d742;
}

.board-grid { @apply w-full overflow-x-auto; }

/* Color bonuses */
.color-bonuses {
  @apply flex gap-2 flex-wrap;
}

.color-chip {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm;
  background: #23232f;
  border: 1px solid #2e2e3e;
}

.color-chip__dot {
  @apply w-3 h-3 rounded-full;
}

.color-chip__val { @apply font-black; font-family: 'Space Mono', monospace; }
.color-chip__val--first { color: #5cc96e; }
.color-chip__val--others { color: #6e6e88; }
.color-chip__val--crossed { @apply line-through opacity-40; }
.color-chip__sep { color: #6e6e88; }

/* Score */
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

/* Controls */
.controls { @apply flex gap-3 flex-wrap justify-center; }

.btn {
  @apply px-5 py-2 rounded-xl font-bold text-sm cursor-pointer transition-all;
  border: none;
}

.btn--primary {
  background: linear-gradient(135deg, #f5d742, #f58a35);
  color: #0f0f13;
}

.btn--primary:hover { filter: brightness(1.1); transform: translateY(-1px); }

.btn--ghost {
  background: #23232f;
  color: #6e6e88;
  border: 1px solid #2e2e3e;
}

.btn--ghost:hover { color: #e8e8f0; }

/* Game Over */
.game-over {
  @apply text-center p-8 rounded-2xl;
  background: #1a1a24;
  border: 1px solid #f5d742;
}

.game-over h2 { @apply text-2xl font-black mb-4; }

.game-over__player { @apply text-lg py-1; }
</style>