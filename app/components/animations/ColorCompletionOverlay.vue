<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'

const props = defineProps<{ color: string; playerName: string }>()
const emit = defineEmits<{ done: [] }>()

const overlayRef = ref<HTMLElement | null>(null)
const ribbonRef = ref<HTMLElement | null>(null)
const tokenRef = ref<HTMLElement | null>(null)

const colorMap: Record<string, string> = { g: '#5cc96e', y: '#f5d742', b: '#5b9ff5', p: '#e85a82', o: '#f58a35' }
const colorHex = computed(() => colorMap[props.color] ?? '#888')

onMounted(async () => {
  if (!process.client) return
  const gsap = (await import('gsap')).default

  const tl = gsap.timeline()

  gsap.set(overlayRef.value, { opacity: 0 })
  gsap.set(ribbonRef.value, { opacity: 0, scale: 0.95, y: 18 })
  gsap.set(tokenRef.value, { opacity: 0, scale: 0 })

  tl.to(overlayRef.value, { opacity: 1, duration: 0.3 }, 0)
  tl.to(ribbonRef.value, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(2)' }, 0.2)
  tl.to(tokenRef.value, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2.5)' }, 0.5)
  tl.to(tokenRef.value, { y: -120, scale: 0.4, opacity: 0, duration: 0.95, ease: 'power2.in' }, 1.0)
  tl.to(overlayRef.value, { opacity: 0, duration: 0.3 }, 3.2)
  tl.add(() => emit('done'), 3.5)
})
</script>

<template>
  <div ref="overlayRef" class="color-completion-overlay">
    <div ref="ribbonRef" class="completion-ribbon" :style="{ background: colorHex + 'e6' }">
      <div class="ribbon-title">COMPLÉTÉ !</div>
      <div class="ribbon-player">{{ playerName }}</div>
    </div>
    <div ref="tokenRef" class="token-plus5">+5</div>
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
  z-index: 100;
  pointer-events: none;
}

.completion-ribbon {
  border-radius: 12px;
  padding: 16px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
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
}
</style>
