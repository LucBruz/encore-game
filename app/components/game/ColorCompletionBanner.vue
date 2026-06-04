<script setup lang="ts">
import { computed, onMounted } from 'vue'

const props = defineProps<{ color: string; playerName: string }>()
const emit = defineEmits<{ done: [] }>()

const colorMap: Record<string, { hex: string; label: string }> = {
  g: { hex: '#5cc96e', label: 'Vert' },
  y: { hex: '#f5d742', label: 'Jaune' },
  b: { hex: '#5b9ff5', label: 'Bleu' },
  p: { hex: '#e85a82', label: 'Rose' },
  o: { hex: '#f58a35', label: 'Orange' },
}
const info = computed(() => colorMap[props.color] ?? { hex: '#888', label: '?' })

onMounted(() => setTimeout(() => emit('done'), 3200))
</script>

<template>
  <div class="completion-banner" :style="{ '--c': info.hex }">
    <div class="banner-dot" />
    <div class="banner-content">
      <span class="banner-name">{{ playerName }}</span>
      <span class="banner-msg">a complété la couleur <strong>{{ info.label }}</strong> !</span>
    </div>
    <div class="banner-shimmer" />
  </div>
</template>

<style scoped>
.completion-banner {
  position: relative;
  width: 100%;
  padding: 10px 16px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: color-mix(in srgb, var(--c) 18%, #1a1a24);
  border: 1.5px solid var(--c);
  overflow: hidden;
  animation: banner-lifecycle 3.2s ease-in-out forwards;
  transform-origin: top center;
}

@keyframes banner-lifecycle {
  0%   { transform: translateY(-12px) scaleY(0.85); opacity: 0; }
  14%  { transform: translateY(0) scaleY(1);         opacity: 1; }
  76%  { transform: translateY(0) scaleY(1);         opacity: 1; }
  100% { transform: translateY(-8px) scaleY(0.9);    opacity: 0; }
}

.banner-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--c);
  flex-shrink: 0;
  box-shadow: 0 0 10px var(--c), 0 0 20px color-mix(in srgb, var(--c) 50%, transparent);
  animation: dot-pulse 1s ease-in-out 0.3s infinite alternate;
}

@keyframes dot-pulse {
  from { box-shadow: 0 0 6px var(--c); }
  to   { box-shadow: 0 0 14px var(--c), 0 0 28px color-mix(in srgb, var(--c) 40%, transparent); }
}

.banner-content {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex: 1;
  flex-wrap: wrap;
}

.banner-name {
  font-family: 'Space Mono', monospace;
  font-size: 13px;
  font-weight: 700;
  color: var(--c);
}

.banner-msg {
  font-family: 'Nunito', sans-serif;
  font-size: 13px;
  color: rgba(232, 232, 240, 0.85);
}

.banner-msg strong {
  color: var(--c);
  font-weight: 900;
}

/* Shimmer sweep */
.banner-shimmer {
  position: absolute;
  top: 0;
  left: -60%;
  width: 40%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--c) 25%, transparent),
    transparent
  );
  animation: shimmer 1.2s ease-in-out 0.35s 1 forwards;
}

@keyframes shimmer {
  from { left: -60%; }
  to   { left: 120%; }
}
</style>
