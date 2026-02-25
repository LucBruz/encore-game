<template>
  <div
    class="cell"
    :class="[
      `cell--${color}`,
      { 'cell--checked': checked },
      { 'cell--start-col': isStartCol },
      { 'cell--star': star },
    ]"
    @click="$emit('click')"
  >
    <!-- Étoile -->
    <span v-if="star" class="cell__star">★</span>

    <!-- Croix si cochée -->
    <span v-if="checked" class="cell__check">✕</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  color: string
  star: boolean
  checked: boolean
  isStartCol: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<style scoped>
.cell {
  @apply relative flex items-center justify-center rounded-lg cursor-pointer select-none transition-transform duration-100 aspect-square;
  border: 2px solid transparent;
}

.cell:hover {
  @apply scale-105 brightness-110;
}

/* Couleurs */
.cell--green  { background: #5cc96e; border-color: #3d9950; }
.cell--yellow { background: #f5d742; border-color: #c4a825; }
.cell--blue   { background: #5b9ff5; border-color: #3a7acc; }
.cell--pink   { background: #e85a82; border-color: #b83a5f; }
.cell--orange { background: #f58a35; border-color: #c4641a; }

/* Colonne de départ H */
.cell--start-col {
  box-shadow: 0 0 0 2px #f5d742, 0 0 12px rgba(245, 215, 66, 0.4);
}

/* Étoile */
.cell__star {
  @apply text-white text-sm leading-none;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
}

/* Croix cochée */
.cell__check {
  @apply absolute inset-0 flex items-center justify-center font-black text-lg rounded-md;
  color: rgba(0, 0, 0, 0.75);
  background: rgba(0, 0, 0, 0.2);
  font-family: 'Space Mono', monospace;
}

/* Quand cochée + étoile, étoile reste visible */
.cell--checked .cell__star {
  @apply z-10 relative;
  color: rgba(255,255,255,0.6);
}
</style>