<template>
  <div
    class="cell"
    :class="[
      `cell--${color}`,
      { 'cell--checked': checked },
      { 'cell--pending': pending },
      { 'cell--valid': isValid && !checked && !pending },
      { 'cell--blocked': isBlocked },
      { 'cell--start-col': isStartCol },
    ]"
    @click="$emit('click')"
  >
    <!-- Étoile -->
    <span v-if="star" class="cell__star" :class="{ 'cell__star--dim': checked || pending }">★</span>

    <!-- Croix cochée définitive -->
    <span v-if="checked" class="cell__check">✕</span>

    <!-- Croix pending provisoire -->
    <span v-else-if="pending" class="cell__pending">✕</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  color: string
  star: boolean
  checked: boolean
  pending?: boolean
  isValid?: boolean
  isBlocked?: boolean
  isStartCol: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<style scoped>
.cell {
  @apply relative flex items-center justify-center rounded-lg select-none transition-all duration-100 aspect-square;
  border: 2px solid transparent;
}

.cell--green  { background: #5cc96e; border-color: #3d9950; }
.cell--yellow { background: #f5d742; border-color: #c4a825; }
.cell--blue   { background: #5b9ff5; border-color: #3a7acc; }
.cell--pink   { background: #e85a82; border-color: #b83a5f; }
.cell--orange { background: #f58a35; border-color: #c4641a; }

/* Case cochable */
.cell--valid {
  @apply cursor-pointer;
  filter: brightness(1.15);
  box-shadow: 0 0 0 2px rgba(255,255,255,0.4);
}

.cell--valid:hover {
  transform: scale(1.08);
  filter: brightness(1.3);
  box-shadow: 0 0 0 2px white;
}

/* Case pending */
.cell--pending {
  @apply cursor-pointer;
  filter: brightness(0.75);
  box-shadow: 0 0 0 2px white, 0 0 12px rgba(255,255,255,0.4);
}

/* Case bloquée */
.cell--blocked {
  @apply cursor-not-allowed;
  filter: brightness(0.45) saturate(0.3);
  opacity: 0.6;
}

/* Case cochée */
.cell--checked {
  @apply cursor-default;
  filter: brightness(0.65) saturate(0.4);
}

/* Colonne H */
.cell--start-col:not(.cell--checked):not(.cell--blocked) {
  box-shadow: 0 0 0 2px #f5d742, 0 0 12px rgba(245,215,66,0.3);
}

.cell__star {
  @apply text-white text-sm leading-none pointer-events-none;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
}

.cell__star--dim { opacity: 0.5; }

.cell__check {
  @apply absolute inset-0 flex items-center justify-center font-black text-lg rounded-md pointer-events-none;
  color: rgba(0, 0, 0, 0.7);
  font-family: 'Space Mono', monospace;
}

.cell__pending {
  @apply absolute inset-0 flex items-center justify-center font-black text-lg rounded-md pointer-events-none;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'Space Mono', monospace;
}
</style>