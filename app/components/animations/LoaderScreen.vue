<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  subtitle?: string
  duration?: number
  ready?: boolean
}>(), {
  subtitle: 'Chargement de la partie...',
  duration: 2000,
  ready: false
})

const emit = defineEmits<{ done: [] }>()

const lettersRef: (HTMLElement | null)[] = []
const bangRef = ref<HTMLElement | null>(null)
const subtitleRef = ref<HTMLElement | null>(null)
const progressRef = ref<HTMLElement | null>(null)
const ringsContainerRef = ref<SVGSVGElement | null>(null)

const LETTERS = 'ENCORE'.split('')

const colors = ['#5cc96e', '#f5d742', '#5b9ff5', '#e85a82', '#f58a35']
const particles = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  color: colors[Math.floor(Math.random() * colors.length)],
  size: 8 + Math.random() * 8
}))

onMounted(async () => {
  if (typeof window === 'undefined') return
  const gsap = (await import('gsap')).default

  const tl = gsap.timeline()

  // Anneaux — on cible les circles via le container SVG
  const rings = ringsContainerRef.value
    ? Array.from(ringsContainerRef.value.querySelectorAll('circle'))
    : []

  if (rings.length) {
    tl.from(rings, {
      scale: 0,
      opacity: 0,
      duration: 0.4,
      stagger: 0.1,
      ease: 'back.out(2)',
      transformOrigin: '50% 50%'
    }, 0)
  }

  // Lettres ENCORE (sans "!")
  const letterEls = lettersRef.filter(Boolean)
  if (letterEls.length) {
    tl.from(letterEls, {
      y: -80,
      opacity: 0,
      rotate: -15,
      duration: 0.5,
      stagger: 0.07,
      ease: 'back.out(2.5)'
    }, 0.25)
  }

  // "!"
  if (bangRef.value) {
    tl.from(bangRef.value, {
      opacity: 0,
      scale: 0,
      duration: 0.3,
      ease: 'back.out(3)'
    }, 0.9)
    tl.to(bangRef.value, {
      y: -14,
      duration: 0.15,
      ease: 'power2.out',
      yoyo: true,
      repeat: 3
    }, 1.0)
  }

  // Sous-titre
  if (subtitleRef.value) {
    tl.from(subtitleRef.value, { opacity: 0, y: 8, duration: 0.4 }, 1.0)
  }

  // Barre de progression
  if (progressRef.value) {
    tl.to(progressRef.value, {
      width: '100%',
      duration: props.duration / 1000,
      ease: 'power2.inOut',
      onComplete: () => setTimeout(() => emit('done'), 200)
    }, 1.1)
  }

  // Si ready devient true avant la fin, fast-forward la barre
  watch(() => props.ready, (val) => {
    if (!val || !progressRef.value) return
    gsap.killTweensOf(progressRef.value)
    gsap.to(progressRef.value, {
      width: '100%',
      duration: 0.3,
      ease: 'power2.out',
      onComplete: () => setTimeout(() => emit('done'), 150)
    })
  })
})
</script>

<template>
  <div class="loader-screen">
    <!-- Pastilles colorées -->
    <div
      v-for="p in particles"
      :key="p.id"
      class="loader-particle"
      :style="{
        left: p.x + '%',
        top: p.y + '%',
        width: p.size + 'px',
        height: p.size + 'px',
        background: p.color
      }"
    />

    <!-- Anneaux SVG concentriques -->
    <svg
      ref="ringsContainerRef"
      class="loader-rings"
      viewBox="0 0 200 200"
      aria-hidden="true"
    >
      <circle class="ring ring-outer" cx="100" cy="100" r="88" />
      <circle class="ring ring-mid"   cx="100" cy="100" r="64" />
      <circle class="ring ring-inner" cx="100" cy="100" r="44" />
    </svg>

    <!-- Titre ENCORE! -->
    <div class="loader-title" aria-label="ENCORE!">
      <span
        v-for="(l, i) in LETTERS"
        :key="i"
        :ref="(el) => { lettersRef[i] = el as HTMLElement }"
        class="loader-letter"
      >{{ l }}</span>
      <span ref="bangRef" class="loader-letter loader-bang">!</span>
    </div>

    <!-- Sous-titre -->
    <p ref="subtitleRef" class="loader-subtitle">{{ subtitle }}</p>

    <!-- Barre de progression -->
    <div class="loader-progress-track">
      <div ref="progressRef" class="loader-progress-bar" />
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ── */
.loader-screen {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: #0f0f13;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* ── Pastilles ── */
.loader-particle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.6;
  pointer-events: none;
}

/* ── Anneaux SVG ── */
.loader-rings {
  position: absolute;
  width: 320px;
  height: 320px;
  pointer-events: none;
}

.ring {
  fill: none;
}

.ring-outer {
  stroke: #f5d742;
  stroke-width: 2px;
  transform-origin: 100px 100px;
  animation: rotate-cw 8s linear infinite;
  stroke-dasharray: 20 12;
}

.ring-mid {
  stroke: #f58a35;
  stroke-width: 2.5px;
  transform-origin: 100px 100px;
  animation: rotate-ccw 5s linear infinite;
  stroke-dasharray: 14 8;
}

.ring-inner {
  stroke: #f5d742;
  stroke-width: 3px;
  transform-origin: 100px 100px;
  animation: rotate-cw 3s linear infinite;
  stroke-dasharray: 8 6;
}

@keyframes rotate-cw {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes rotate-ccw {
  from { transform: rotate(0deg); }
  to   { transform: rotate(-360deg); }
}

/* ── Titre ── */
.loader-title {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 0.02em;
  user-select: none;
}

.loader-letter {
  display: inline-block;
  font-family: 'Space Mono', monospace;
  font-size: 104px;
  font-weight: 700;
  line-height: 1;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  /* initial state hidden — GSAP animates from */
  opacity: 0;
}

.loader-bang {
  margin-left: 0.01em;
}

/* ── Sous-titre ── */
.loader-subtitle {
  position: relative;
  z-index: 1;
  margin-top: 20px;
  font-family: 'Space Mono', monospace;
  font-size: 14px;
  letter-spacing: 0.12em;
  color: rgba(245, 215, 66, 0.7);
  text-transform: uppercase;
  opacity: 0;
}

/* ── Barre de progression ── */
.loader-progress-track {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(245, 215, 66, 0.15);
}

.loader-progress-bar {
  height: 100%;
  width: 0%;
  background: #f5d742;
  box-shadow: 0 0 8px #f5d742aa;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .loader-letter {
    font-size: 52px;
  }

  .loader-rings {
    width: 200px;
    height: 200px;
  }
}
</style>
