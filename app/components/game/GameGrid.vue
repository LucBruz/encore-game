<template>
  <div class="game-grid" :class="{ 'game-grid--readonly': readonly }">

    <!-- En-tête colonnes -->
    <div class="grid-header">
      <div
        v-for="(col, i) in COLS"
        :key="col"
        class="col-label"
        :class="{ 'col-label--start': i === 7 }"
      >
        {{ col }}
      </div>
    </div>

    <!-- Grille -->
    <div class="grid-cells">
      <GameCell
        v-for="([colorKey, hasStar], idx) in grid.cells"
        :key="idx"
        :color="COLOR_MAP[colorKey].name"
        :star="hasStar"
        :checked="checkedCells.has(idx)"
        :pending="pendingCells.includes(idx)"
        :is-valid="validCells.has(idx)"
        :is-blocked="isBlockedMode && !validCells.has(idx) && !checkedCells.has(idx) && !pendingCells.includes(idx)"
        :is-start-col="idx % 15 === 7"
        @click="handleCellClick(idx)"
      />
    </div>

    <!-- Points colonnes -->
    <div class="grid-footer">
      <div class="points-row">
        <div
          v-for="(col, i) in COLS"
          :key="`f-${col}`"
          class="points-cell"
          :class="{
            'points-cell--start': i === 7,
            'points-cell--crossed': columnBonus[col] !== null
          }"
        >
          {{ COLUMN_POINTS[col].first }}
        </div>
      </div>
      <div class="points-row">
        <div
          v-for="(col, i) in COLS"
          :key="`o-${col}`"
          class="points-cell points-cell--others"
          :class="{ 'points-cell--start': i === 7 }"
        >
          {{ COLUMN_POINTS[col].others }}
        </div>
      </div>
    </div>

    <!-- Message d'erreur placement -->
    <div v-if="placementError" class="placement-error">
      ⚠️ {{ placementError }}
    </div>

    <!-- Bouton confirmer placement -->
    <div v-if="pendingCells.length > 0 && confirmedCombo" class="placement-confirm">
      <span class="placement-confirm__count">
        {{ pendingCells.length }} / {{ confirmedCombo.count }} case(s) sélectionnée(s)
      </span>
      <button
        class="btn-confirm-placement"
        :disabled="pendingCells.length !== confirmedCombo.count || readonly"
        @click="$emit('confirm-placement')"
      >
        ✓ Valider le placement
      </button>
      <button class="btn-cancel-placement" :disabled="readonly" @click="$emit('cancel-placement')">
        ✕ Annuler
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { COLS, COLUMN_POINTS, COLOR_MAP } from '~/data/grids/grid-01'
import type { PlayerState } from '~/stores/gameStore'

const props = defineProps<{
  grid: typeof import('~/data/grids/grid-01').GRID_01
  checkedCells: Set<number>
  pendingCells: number[]
  validCells: Set<number>
  columnBonus: PlayerState['columnBonus']
  confirmedCombo: { color: string; count: number } | null
  placementError: string | null
  isBlockedMode: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  'cell-click': [idx: number]
  'confirm-placement': []
  'cancel-placement': []
}>()

function handleCellClick(idx: number) {
  if (props.readonly) return
  // Ignorer les cases déjà cochées définitivement
  if (props.checkedCells.has(idx)) return
  emit('cell-click', idx)
}
</script>

<style scoped>
.game-grid {
  @apply w-full flex flex-col gap-2;
}

.game-grid--readonly :deep(.game-cell) {
  cursor: default !important;
  pointer-events: none;
}

.grid-header {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  @apply gap-1 mb-1;
}

.col-label {
  @apply text-center text-xs font-bold py-1 rounded;
  font-family: 'Space Mono', monospace;
  color: #6e6e88;
}

.col-label--start {
  color: #f5d742;
  background: rgba(245, 215, 66, 0.1);
}

.grid-cells {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  @apply gap-1;
}

.grid-footer { @apply mt-1; }

.points-row {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  @apply gap-1;
}

.points-cell {
  @apply text-center text-xs font-bold py-0.5;
  font-family: 'Space Mono', monospace;
  color: #e8e8f0;
}

.points-cell--others { color: #6e6e88; }
.points-cell--start { color: #f5d742; }
.points-cell--crossed { @apply line-through opacity-40; }

.placement-error {
  @apply text-xs px-3 py-2 rounded-lg;
  background: rgba(232, 90, 130, 0.15);
  color: #e85a82;
  border: 1px solid rgba(232, 90, 130, 0.3);
}

.placement-confirm {
  @apply flex items-center gap-3 flex-wrap px-3 py-2 rounded-xl;
  background: #23232f;
  border: 1px solid #3e3e52;
}

.placement-confirm__count {
  @apply text-xs font-bold;
  color: #6e6e88;
}

.btn-confirm-placement {
  @apply px-4 py-1.5 rounded-lg font-black text-sm cursor-pointer transition-all;
  background: #5cc96e;
  color: #0f0f13;
  border: none;
}

.btn-confirm-placement:hover:not(:disabled) { filter: brightness(1.1); }
.btn-confirm-placement:disabled { @apply opacity-40 cursor-not-allowed; }

.btn-cancel-placement {
  @apply px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all;
  background: transparent;
  color: #6e6e88;
  border: 1px solid #2e2e3e;
}

.btn-cancel-placement:hover {
  color: #e85a82;
  border-color: #e85a82;
}
</style>