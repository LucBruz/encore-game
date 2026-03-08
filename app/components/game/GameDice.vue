<template>
  <div
    class="dice"
    :class="[
      `dice--${type}`,
      { 'dice--selected': selected },
      { 'dice--selectable': selectable },
      { 'dice--joker': isJoker },
    ]"
    @click="selectable && $emit('select')"
  >
    <!-- Dé couleur -->
    <template v-if="type === 'color'">
      <span v-if="isJoker" class="dice__joker">✕</span>
      <span v-else class="dice__color-dot" :style="{ background: colorHex }" />
    </template>

    <!-- Dé chiffre -->
    <template v-else>
      <span v-if="isJoker" class="dice__joker">?</span>
      <span v-else class="dice__number">{{ value }}</span>
    </template>

    <!-- Indicateur sélectionné -->
    <div v-if="selected" class="dice__selected-ring" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { COLOR_MAP } from '~/data/grids/grid-01'
import type { ColorFace, NumberFace } from '~/stores/gameStore'

const props = defineProps<{
  type: 'color' | 'number'
  value: ColorFace | NumberFace
  selected?: boolean
  selectable?: boolean
}>()

defineEmits<{
  select: []
}>()

const isJoker = computed(() => props.value === 'joker')

const colorHex = computed(() => {
  if (props.type !== 'color' || props.value === 'joker') return ''
  return COLOR_MAP[props.value as keyof typeof COLOR_MAP]?.hex ?? ''
})
</script>

<style scoped>
.dice {
  @apply relative flex items-center justify-center rounded-xl select-none transition-all duration-150;
  width: 52px;
  height: 52px;
  background: #23232f;
  border: 2px solid #3e3e52;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
}

/* Selectable */
.dice--selectable {
  @apply cursor-pointer;
}

.dice--selectable:hover {
  border-color: #f5d742;
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0,0,0,0.5), 0 0 12px rgba(245,215,66,0.2);
}

/* Selected */
.dice--selected {
  border-color: #f5d742;
  background: #2a2a1a;
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 16px rgba(245,215,66,0.3);
}

/* Color dot */
.dice__color-dot {
  @apply rounded-full;
  width: 28px;
  height: 28px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}

/* Number */
.dice__number {
  font-family: 'Space Mono', monospace;
  @apply font-black text-2xl;
  color: #e8e8f0;
}

/* Joker */
.dice__joker {
  font-family: 'Space Mono', monospace;
  @apply font-black text-xl;
  color: #0f0f13;
}

.dice--joker {
  background: #e8e8f0;
  border-color: #aaaacc;
}

.dice--joker:hover {
  border-color: #f5d742;
  background: #fffff0;
}

/* Selected ring animation */
.dice__selected-ring {
  @apply absolute inset-0 rounded-xl pointer-events-none;
  border: 2px solid #f5d742;
  animation: pulse-ring 1.5s ease-in-out infinite;
}

@keyframes pulse-ring {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(1.05); }
}
</style>