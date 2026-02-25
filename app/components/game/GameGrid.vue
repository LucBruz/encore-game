<template>
  <div class="game-grid">

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
        v-for="(cell, idx) in grid.cells"
        :key="idx"
        :color="COLOR_MAP[cell[0]].name"
        :star="cell[1]"
        :checked="checkedCells.has(idx)"
        :is-start-col="idx % 15 === 7"
        @click="$emit('cell-click', idx)"
      />
    </div>

    <!-- Points colonnes -->
    <div class="grid-footer">
      <div class="points-row">
        <div
          v-for="(col, i) in COLS"
          :key="`f-${col}`"
          class="points-cell"
          :class="{ 'points-cell--start': i === 7, 'points-cell--crossed': columnBonus[col] !== null }"
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

  </div>
</template>

<script setup lang="ts">
import { COLS, COLUMN_POINTS, COLOR_MAP } from '~/data/grids/grid-01'
import type { PlayerState } from '~/stores/gameStore'

const props = defineProps<{
  grid: typeof import('~/data/grids/grid-01').GRID_01
  checkedCells: Set<number>
  columnBonus: PlayerState['columnBonus']
}>()

defineEmits<{
  'cell-click': [idx: number]
}>()
</script>

<style scoped>
.game-grid {
  @apply w-full;
}

/* Header */
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

/* Grille */
.grid-cells {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  @apply gap-1;
}

/* Footer points */
.grid-footer {
  @apply mt-1;
}

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

.points-cell--others {
  color: #6e6e88;
}

.points-cell--start {
  color: #f5d742;
}

.points-cell--crossed {
  @apply line-through opacity-40;
}
</style>