<template>
  <div
    class="cell"
    :class="[
      `cell--${color}`,
      { 'cell--checked': checked },
      { 'cell--pending': pending },
      { 'cell--valid': isValid && !checked && !pending },
      { 'cell--blocked': isBlocked },
      { 'cell--rejected': rejected },
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
  /** Clic refusé : secousse courte pour dire non sans vider l'écran. */
  rejected?: boolean
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

/* Case cochable — c'est elle qui doit attirer l'œil, pas le reste qui doit s'éteindre. */
.cell--valid {
  @apply cursor-pointer;
  filter: brightness(1.15);
  box-shadow: 0 0 0 3px rgba(255,255,255,0.85), 0 0 14px rgba(255,255,255,0.35);
  animation: cell-breathe 1.6s ease-in-out infinite;
}

.cell--valid:hover {
  transform: scale(1.08);
  filter: brightness(1.3);
  box-shadow: 0 0 0 3px white, 0 0 18px rgba(255,255,255,0.6);
  animation: none;
}

@keyframes cell-breathe {
  0%, 100% { box-shadow: 0 0 0 3px rgba(255,255,255,0.85), 0 0 14px rgba(255,255,255,0.35); }
  50%      { box-shadow: 0 0 0 3px rgba(255,255,255,0.55), 0 0 6px rgba(255,255,255,0.15); }
}

/* Case pending */
.cell--pending {
  @apply cursor-pointer;
  filter: brightness(0.85);
  box-shadow: 0 0 0 3px white, 0 0 12px rgba(255,255,255,0.4);
}

/* Case bloquée — atténuée, jamais éteinte : la couleur et les croix restent lisibles
   pour qu'on puisse continuer à lire sa grille pendant le placement. */
.cell--blocked {
  @apply cursor-not-allowed;
  filter: brightness(0.82) saturate(0.9);
}

/* Case cochée */
.cell--checked {
  @apply cursor-default;
  filter: brightness(0.85) saturate(0.95);
}

/* Clic refusé */
.cell--rejected {
  animation: cell-shake 0.35s ease-in-out;
}

@keyframes cell-shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-3px); }
  40%      { transform: translateX(3px); }
  60%      { transform: translateX(-2px); }
  80%      { transform: translateX(2px); }
}

@media (prefers-reduced-motion: reduce) {
  .cell--valid { animation: none; }
  .cell--rejected { animation: none; outline: 2px solid #e85a82; }
}

/* Colonne H */
.cell--start-col:not(.cell--checked):not(.cell--blocked) {
  box-shadow: 0 0 0 2px #f5d742, 0 0 12px rgba(245,215,66,0.3);
}

.cell__star {
  @apply text-white text-sm leading-none pointer-events-none;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
}

.cell__star--dim { opacity: 0.75; }

/* Croix en blanc cerné de noir : lisible sur les cinq couleurs, y compris le jaune. */
.cell__check {
  @apply absolute inset-0 flex items-center justify-center font-black text-lg rounded-md pointer-events-none;
  color: #ffffff;
  text-shadow: 0 0 3px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8);
  font-family: 'Space Mono', monospace;
}

.cell__pending {
  @apply absolute inset-0 flex items-center justify-center font-black text-lg rounded-md pointer-events-none;
  color: #ffffff;
  text-shadow: 0 0 3px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8);
  font-family: 'Space Mono', monospace;
}
</style>
