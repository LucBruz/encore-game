<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{
  playerName: string
}>()

const emit = defineEmits<{ done: [] }>()

const overlayRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const welcomeRef = ref<HTMLElement | null>(null)
const nameRef = ref<HTMLElement | null>(null)
const progressRef = ref<HTMLElement | null>(null)

const colors = ['#5cc96e', '#f5d742', '#5b9ff5', '#e85a82', '#f58a35']
const particles = Array.from({ length: 32 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  color: colors[Math.floor(Math.random() * colors.length)],
  size: 6 + Math.random() * 10,
}))

onMounted(async () => {
  if (!import.meta.client) return
  const gsap = (await import('gsap')).default

  const tl = gsap.timeline()

  gsap.set(overlayRef.value, { opacity: 0 })
  gsap.set(titleRef.value, { y: -60, opacity: 0, scale: 0.8 })
  gsap.set(welcomeRef.value, { opacity: 0, y: 16 })
  gsap.set(nameRef.value, { opacity: 0, y: 20, scale: 0.9 })

  tl.to(overlayRef.value, { opacity: 1, duration: 0.4 }, 0)

  tl.to(titleRef.value, {
    y: 0,
    opacity: 1,
    scale: 1,
    duration: 0.55,
    ease: 'back.out(2.2)',
  }, 0.2)

  tl.to(welcomeRef.value, {
    opacity: 1,
    y: 0,
    duration: 0.4,
    ease: 'power2.out',
  }, 0.65)

  tl.to(nameRef.value, {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.5,
    ease: 'back.out(2)',
  }, 0.85)

  if (progressRef.value) {
    tl.to(progressRef.value, {
      width: '100%',
      duration: 2.2,
      ease: 'power2.inOut',
      onComplete: () => setTimeout(() => {
        gsap.to(overlayRef.value, {
          opacity: 0,
          duration: 0.4,
          onComplete: () => emit('done'),
        })
      }, 200),
    }, 1.1)
  }
})
</script>

<template>
  <div ref="overlayRef" class="launch-overlay">
    <!-- Pastilles colorées -->
    <div
      v-for="p in particles"
      :key="p.id"
      class="launch-particle"
      :style="{
        left: p.x + '%',
        top: p.y + '%',
        width: p.size + 'px',
        height: p.size + 'px',
        background: p.color,
      }"
    />

    <!-- Contenu centré -->
    <div class="launch-content">
      <div ref="titleRef" class="launch-title">ENCORE!</div>
      <p ref="welcomeRef" class="launch-welcome">Bienvenue dans la partie</p>
      <div ref="nameRef" class="launch-name">{{ playerName }}</div>
    </div>

    <!-- Barre de progression -->
    <div class="launch-progress-track">
      <div ref="progressRef" class="launch-progress-bar" />
    </div>
  </div>
</template>

<style scoped>
.launch-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: #0f0f13;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.launch-particle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.55;
  pointer-events: none;
}

.launch-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.launch-title {
  font-family: 'Space Mono', monospace;
  font-size: clamp(64px, 14vw, 112px);
  font-weight: 700;
  line-height: 1;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  user-select: none;
}

.launch-welcome {
  font-family: 'Space Mono', monospace;
  font-size: 13px;
  letter-spacing: 0.14em;
  color: rgba(245, 215, 66, 0.6);
  text-transform: uppercase;
  margin: 0;
}

.launch-name {
  font-family: 'Nunito', sans-serif;
  font-size: clamp(22px, 5vw, 36px);
  font-weight: 800;
  color: #e8e8f0;
}

.launch-progress-track {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(245, 215, 66, 0.15);
}

.launch-progress-bar {
  height: 100%;
  width: 0%;
  background: #f5d742;
  box-shadow: 0 0 8px #f5d742aa;
}
</style>
