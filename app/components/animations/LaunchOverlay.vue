<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{ playerName: string }>()
const emit = defineEmits<{ done: [] }>()

// ── Dés colorés simulés (décoration visuelle) ──
const COLORS = { g: '#5cc96e', y: '#f5d742', b: '#5b9ff5', p: '#e85a82', o: '#f58a35' }
const DICE = [
  { kind: 'c', color: '#f5d742' },  // couleur jaune
  { kind: 'c', color: '#5cc96e' },  // couleur vert
  { kind: 'c', color: '#5b9ff5' },  // couleur bleu
  { kind: 'n', num: 3 },
  { kind: 'n', num: 5 },
  { kind: 'n', num: 1 },
]

// Mini-grille décorative
const MINI_COLORS = ['g', 'y', 'b', 'p', 'o'] as const
const MINI_GRID = Array.from({ length: 50 }, (_, i) => ({
  color: COLORS[MINI_COLORS[i % 5]],
  star: Math.random() < 0.07,
}))

// Pastilles de fond
const particles = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  x: Math.random() * 800 - 400,
  y: Math.random() * 420 - 210,
  color: Object.values(COLORS)[i % 5],
  size: 6 + Math.random() * 18,
}))

// Refs
const overlayRef = ref<HTMLElement | null>(null)
const flashRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const subRef = ref<HTMLElement | null>(null)
const playerChipRef = ref<HTMLElement | null>(null)
const progressRef = ref<HTMLElement | null>(null)
const turnLabelRef = ref<HTMLElement | null>(null)
const dotRefs: HTMLElement[] = []
const diceRefs: HTMLElement[] = []
const cellRefs: HTMLElement[] = []

onMounted(async () => {
  if (!import.meta.client) return
  const gsap = (await import('gsap')).default
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })

  // ── États initiaux ──────────────────────────────────────────────
  gsap.set(overlayRef.value, { opacity: 0 })
  gsap.set(flashRef.value, { opacity: 0 })
  gsap.set(titleRef.value, { opacity: 0, y: -20, scale: 0.9 })
  gsap.set(subRef.value, { opacity: 0, y: -8 })
  gsap.set(playerChipRef.value, { opacity: 0, y: 14, scale: 0.9 })
  gsap.set(turnLabelRef.value, { opacity: 0, y: 10 })
  gsap.set(dotRefs, { scale: 0, opacity: 0 })
  gsap.set(diceRefs, { y: -240, opacity: 0, scale: 0.6 })
  gsap.set(cellRefs, { scale: 0, opacity: 0, rotate: -30 })

  // Fond fade-in
  tl.to(overlayRef.value, { opacity: 1, duration: 0.4 }, 0)

  // Pastilles
  tl.to(dotRefs, {
    scale: 1, opacity: 0.45, duration: 0.55,
    stagger: { each: 0.02, from: 'random' }, ease: 'back.out(2)',
  }, 0.05)

  // Flash
  tl.to(flashRef.value, { opacity: 0.6, duration: 0.08 }, 0.35)
    .to(flashRef.value, { opacity: 0, duration: 0.5 }, '>')

  // Titre ENCORE!
  tl.to(titleRef.value, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(2)' }, 0.3)
  tl.to(subRef.value, { opacity: 1, y: 0, duration: 0.4 }, 0.6)

  // Dés tombent
  tl.to(diceRefs, {
    y: 0, opacity: 1, scale: 1,
    rotate: () => gsap.utils.random(-20, 20),
    duration: 0.65, stagger: { each: 0.06, from: 'random' }, ease: 'back.out(1.8)',
  }, 0.5)
  tl.to(diceRefs, { rotate: 0, duration: 0.25 }, '>-0.1')

  // Chip joueur
  tl.to(playerChipRef.value, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.8)' }, 0.7)

  // Mini-grille se construit
  tl.to(cellRefs, {
    scale: 1, opacity: 1, rotate: 0, duration: 0.4,
    stagger: { each: 0.01, from: 'edges', grid: [5, 10] },
    ease: 'back.out(2)',
  }, 0.75)

  // Label bas
  tl.to(turnLabelRef.value, { opacity: 1, y: 0, duration: 0.4 }, '-=0.1')

  // Barre de progression
  if (progressRef.value) {
    tl.to(progressRef.value, {
      width: '100%',
      duration: 2.4,
      ease: 'power2.inOut',
      onComplete: () => {
        gsap.to(overlayRef.value, {
          opacity: 0, duration: 0.4,
          onComplete: () => emit('done'),
        })
      },
    }, 0.6)
  }
})
</script>

<template>
  <div ref="overlayRef" class="launch-overlay">

    <!-- Flash radial -->
    <div ref="flashRef" class="launch-flash" />

    <!-- Pastilles flottantes -->
    <div class="launch-dots" aria-hidden="true">
      <span
        v-for="(p, i) in particles"
        :key="i"
        :ref="(el) => { if (el) dotRefs[i] = el as HTMLElement }"
        class="ld"
        :style="{
          transform: `translate(${p.x}px, ${p.y}px)`,
          width: p.size + 'px',
          height: p.size + 'px',
          background: p.color,
        }"
      />
    </div>

    <!-- Contenu centré -->
    <div class="launch-content">
      <!-- Titre -->
      <div ref="titleRef" class="launch-title">ENCORE !</div>
      <div ref="subRef" class="launch-sub">
        Bienvenue dans la partie
      </div>

      <!-- Chip joueur -->
      <div ref="playerChipRef" class="launch-chip">
        <span class="lc-ico">🎲</span>
        <span class="lc-name">{{ playerName }}</span>
        <span class="lc-you">toi</span>
      </div>

      <!-- Dés -->
      <div class="launch-dice">
        <div
          v-for="(d, i) in DICE"
          :key="i"
          :ref="(el) => { if (el) diceRefs[i] = el as HTMLElement }"
          class="die"
        >
          <span v-if="d.kind === 'c'" class="die-color" :style="{ background: d.color }" />
          <span v-else class="die-num">{{ d.num }}</span>
        </div>
      </div>

      <!-- Mini-grille -->
      <div class="launch-grid">
        <span
          v-for="(cell, i) in MINI_GRID"
          :key="i"
          :ref="(el) => { if (el) cellRefs[i] = el as HTMLElement }"
          class="lc-cell"
          :style="{ background: cell.color }"
        >
          <span v-if="cell.star" class="lc-star">★</span>
        </span>
      </div>

      <!-- Label bas -->
      <div ref="turnLabelRef" class="launch-turn-label">
        <span class="dot-pulse" />
        Tour 1 · Tout le monde joue !
      </div>
    </div>

    <!-- Barre de progression -->
    <div class="launch-progress-track">
      <div ref="progressRef" class="launch-progress-bar" />
    </div>

  </div>
</template>

<style scoped>
/* ── Overlay ── */
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

/* ── Flash ── */
.launch-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(245, 215, 66, 0.55),
    rgba(245, 138, 53, 0.15) 40%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 5;
  mix-blend-mode: screen;
}

/* ── Pastilles ── */
.launch-dots {
  position: absolute;
  left: 50%;
  top: 50%;
  pointer-events: none;
}
.ld {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

/* ── Contenu ── */
.launch-content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

/* ── Titre ── */
.launch-title {
  font-family: 'Space Mono', monospace;
  font-size: clamp(52px, 12vw, 96px);
  font-weight: 700;
  line-height: 1;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  user-select: none;
}

.launch-sub {
  font-family: 'Space Mono', monospace;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(245, 215, 66, 0.55);
}

/* ── Chip joueur ── */
.launch-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-radius: 99px;
  background: #23232f;
  border: 1px solid #f5d742;
  font-size: 13px;
  color: #e8e8f0;
}
.lc-ico { font-size: 15px; }
.lc-name { font-weight: 800; font-family: 'Space Mono', monospace; }
.lc-you {
  font-size: 10px;
  color: #f5d742;
  background: rgba(245, 215, 66, 0.15);
  padding: 2px 6px;
  border-radius: 99px;
}

/* ── Dés ── */
.launch-dice {
  display: flex;
  gap: 10px;
}

.die {
  width: 50px;
  height: 50px;
  border-radius: 10px;
  background: #23232f;
  border: 1px solid #2e2e3e;
  display: flex;
  align-items: center;
  justify-content: center;
}

.die-num {
  font-family: 'Space Mono', monospace;
  font-weight: 700;
  font-size: 22px;
  color: #e8e8f0;
}

.die-color {
  width: 22px;
  height: 22px;
  border-radius: 50%;
}

/* ── Mini-grille ── */
.launch-grid {
  display: grid;
  grid-template-columns: repeat(10, 26px);
  gap: 3px;
}

.lc-cell {
  width: 26px;
  height: 26px;
  border-radius: 5px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lc-star {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

/* ── Label bas ── */
.launch-turn-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Space Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e6e88;
}

.dot-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #5cc96e;
  box-shadow: 0 0 8px #5cc96e;
  animation: dp 1.4s infinite ease-in-out;
}

@keyframes dp {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 1; }
}

/* ── Barre de progression ── */
.launch-progress-track {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(245, 215, 66, 0.12);
}

.launch-progress-bar {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #f5d742, #f58a35);
  box-shadow: 0 0 8px rgba(245, 215, 66, 0.6);
}
</style>
