<script setup lang="ts">
import { computed, onMounted } from 'vue'

const props = defineProps<{ color: string; playerName: string }>()
const emit = defineEmits<{ done: [] }>()

const colorMap: Record<string, string> = { g: '#5cc96e', y: '#f5d742', b: '#5b9ff5', p: '#e85a82', o: '#f58a35' }
const colorHex = computed(() => colorMap[props.color] ?? '#888')

onMounted(() => {
  setTimeout(() => emit('done'), 3500)
})
</script>

<template>
  <div class="color-completion-overlay">
    <div class="completion-ribbon" :style="{ background: colorHex + 'e6' }">
      <div class="ribbon-title">COMPLÉTÉ !</div>
      <div class="ribbon-player">{{ playerName }}</div>
    </div>
    <div class="token-plus5">+5</div>
  </div>
</template>

<style scoped>
.color-completion-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 15, 19, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  z-index: 200;
  pointer-events: none;
  animation: overlay-in 0.3s ease-out forwards, overlay-out 0.3s ease-in 3.2s forwards;
}

@keyframes overlay-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes overlay-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

.completion-ribbon {
  border-radius: 12px;
  padding: 16px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  animation: ribbon-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
}

@keyframes ribbon-in {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.ribbon-title {
  font-family: 'Space Mono', monospace;
  font-size: 28px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.05em;
  line-height: 1;
}

.ribbon-player {
  font-family: 'Nunito', sans-serif;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1;
}

.token-plus5 {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f5d742;
  color: #1a1a24;
  font-family: 'Nunito', sans-serif;
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px rgba(245, 215, 66, 0.5);
  animation: token-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s both,
             token-fly 0.95s ease-in 1.0s forwards;
}

@keyframes token-pop {
  from { opacity: 0; transform: scale(0); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes token-fly {
  to { opacity: 0; transform: translateY(-120px) scale(0.4); }
}
</style>
