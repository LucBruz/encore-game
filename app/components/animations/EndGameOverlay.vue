<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'

interface Player {
  name: string
  isLocal: boolean
  score: number
  colors: number
  columns: number
  jokers: number
  stars: number
}

const props = defineProps<{ players: Player[] }>()
const emit = defineEmits<{ replay: [] }>()

const sortedPlayers = computed(() => [...props.players].sort((a, b) => b.score - a.score))
const winner = computed(() => sortedPlayers.value[0])

// Refs
const tropheeRef = ref<HTMLElement | null>(null)
const winnerNameRef = ref<HTMLElement | null>(null)
const winnerSubtitleRef = ref<HTMLElement | null>(null)
const cardRefs: HTMLElement[] = []
const scoreEls: HTMLElement[] = []
const ctaRef = ref<HTMLElement | null>(null)
const confettiRefs: HTMLElement[] = []

// Confetti data — generated once at component creation
const confettiColors = ['#5cc96e', '#f5d742', '#5b9ff5', '#e85a82', '#f58a35']
const confettis = Array.from({ length: 64 }, (_, i) => ({
  id: i,
  color: confettiColors[i % confettiColors.length],
  size: 6 + Math.floor(Math.random() * 9), // 6–14px
  isRound: i % 2 === 0,
  left: Math.random() * 100, // % horizontal position
  initialY: -60 - Math.random() * 140, // start above viewport
  rotate: Math.random() * 360,
}))

onMounted(async () => {
  if (!import.meta.client) return
  const gsap = (await import('gsap')).default
  const tl = gsap.timeline()

  const height = window.innerHeight

  // --- Initial hidden states ---
  gsap.set(tropheeRef.value, { scale: 0, rotate: -45, opacity: 0 })
  gsap.set(winnerNameRef.value, { opacity: 0, y: -20 })
  gsap.set(winnerSubtitleRef.value, { opacity: 0, y: -20 })
  gsap.set(cardRefs, { opacity: 0, y: 30 })
  gsap.set(ctaRef.value, { opacity: 0 })
  gsap.set(confettiRefs, { opacity: 0 })

  // t=0.1 : trophée scale 0→1 + rotate -45→0
  tl.to(tropheeRef.value, {
    scale: 1,
    rotate: 0,
    opacity: 1,
    duration: 0.6,
    ease: 'back.out(2.5)',
  }, 0.1)

  // Trophy wiggle after entrance
  tl.to(tropheeRef.value, { rotate: 8, duration: 0.12, repeat: 5, yoyo: true, ease: 'none' }, 0.75)

  // t=0.5 : nom gagnant + sous-titre
  tl.to(winnerNameRef.value, {
    opacity: 1,
    y: 0,
    duration: 0.5,
    ease: 'back.out(1.8)',
  }, 0.5)
  tl.to(winnerSubtitleRef.value, {
    opacity: 1,
    y: 0,
    duration: 0.5,
    ease: 'back.out(1.8)',
  }, 0.6)

  // t=0.7 : cartes joueurs
  tl.to(cardRefs, {
    opacity: 1,
    y: 0,
    duration: 0.45,
    stagger: 0.12,
    ease: 'back.out(1.6)',
  }, 0.7)

  // t=0.7 : confettis tombent
  tl.to(confettiRefs, {
    opacity: 1,
    y: () => height + 40,
    duration: () => 1.6 + Math.random() * 1.2,
    rotate: () => Math.random() * 720 - 360,
    ease: 'none',
    stagger: { from: 'random', amount: 0.8 },
  }, 0.7)

  // t=0.95 : scores comptent de 0 → total
  sortedPlayers.value.forEach((player, i) => {
    const obj = { val: 0 }
    tl.to(obj, {
      val: player.score,
      duration: 1.2,
      ease: 'power3.out',
      onUpdate: () => {
        if (scoreEls[i]) {
          scoreEls[i]!.textContent = Math.round(obj.val).toString()
        }
      },
    }, 0.95)
  })

  // t=1.5 : CTA bouton
  tl.to(ctaRef.value, {
    opacity: 1,
    duration: 0.4,
    ease: 'power2.out',
  }, 1.5)
})
</script>

<template>
  <div class="end-game-overlay">
    <!-- Confettis -->
    <div
      v-for="c in confettis"
      :key="c.id"
      :ref="(el) => { if (el) confettiRefs[c.id] = el as unknown as HTMLElement }"
      class="confetti"
      :style="{
        left: c.left + '%',
        top: c.initialY + 'px',
        width: c.size + 'px',
        height: c.size + 'px',
        background: c.color,
        borderRadius: c.isRound ? '50%' : '2px',
      }"
    />

    <!-- Content -->
    <div class="overlay-content">
      <!-- Trophée -->
      <div ref="tropheeRef" class="trophy" aria-hidden="true">🏆</div>

      <!-- Nom du gagnant -->
      <h1 ref="winnerNameRef" class="winner-name">{{ winner?.name }}</h1>
      <p ref="winnerSubtitleRef" class="winner-subtitle">remporte la partie !</p>

      <!-- Cartes joueurs -->
      <div class="players-grid">
        <div
          v-for="(player, i) in sortedPlayers"
          :key="player.name"
          :ref="(el) => { if (el) cardRefs[i] = el as unknown as HTMLElement }"
          class="player-card"
          :class="{ 'player-card--first': i === 0 }"
        >
          <!-- Rang -->
          <div class="player-rank">{{ i + 1 }}</div>

          <!-- Infos joueur -->
          <div class="player-info">
            <div class="player-name">
              {{ player.name }}
              <span v-if="player.isLocal" class="player-you">(vous)</span>
            </div>
            <div class="player-details">
              <span>{{ player.colors }} coul.</span>
              <span>{{ player.columns }} col.</span>
              <span>{{ player.jokers }} jokers</span>
              <span v-if="player.stars < 0" class="star-penalty">{{ player.stars }} étoiles</span>
            </div>
          </div>

          <!-- Score -->
          <div class="player-score">
            <span
              :ref="(el) => { if (el) scoreEls[i] = el as unknown as HTMLElement }"
              class="score-value"
            >0</span>
            <span class="score-unit">pts</span>
          </div>
        </div>
      </div>

      <!-- CTA Rejouer -->
      <button ref="ctaRef" class="cta-button" @click="emit('replay')">
        Rejouer une partie →
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ── Overlay ── */
.end-game-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: #0f0f13;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* ── Confettis ── */
.confetti {
  position: absolute;
  pointer-events: none;
  will-change: transform;
}

/* ── Content ── */
.overlay-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 24px;
  max-width: 600px;
  width: 100%;
}

/* ── Trophée ── */
.trophy {
  font-size: 64px;
  line-height: 1;
  filter: drop-shadow(0 4px 16px rgba(245, 215, 66, 0.5));
  user-select: none;
}

/* ── Winner name ── */
.winner-name {
  font-family: 'Space Mono', monospace;
  font-size: clamp(32px, 6vw, 52px);
  font-weight: 700;
  margin: 0;
  line-height: 1.1;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-align: center;
}

.winner-subtitle {
  font-family: 'Space Mono', monospace;
  font-size: 14px;
  letter-spacing: 0.08em;
  color: rgba(245, 215, 66, 0.65);
  text-transform: uppercase;
  margin: 0;
}

/* ── Players grid ── */
.players-grid {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.player-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
  border-radius: 12px;
  padding: 16px 20px;
}

.player-card--first {
  border: 2px solid #f5d742;
  box-shadow: 0 0 16px rgba(245, 215, 66, 0.15);
}

.player-rank {
  font-family: 'Space Mono', monospace;
  font-size: 18px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.35);
  min-width: 24px;
  text-align: center;
}

.player-card--first .player-rank {
  color: #f5d742;
}

.player-info {
  flex: 1;
  min-width: 0;
}

.player-name {
  font-family: 'Space Mono', monospace;
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-you {
  font-size: 12px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.45);
  margin-left: 6px;
}

.player-details {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-family: 'Nunito', sans-serif;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  flex-wrap: wrap;
}

.star-penalty {
  color: #e85a82;
}

/* ── Score ── */
.player-score {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-shrink: 0;
}

.score-value {
  font-family: 'Space Mono', monospace;
  font-size: 28px;
  font-weight: 700;
  color: #f5d742;
  min-width: 3ch;
  text-align: right;
  display: inline-block;
}

.player-card--first .score-value {
  font-size: 32px;
}

.score-unit {
  font-family: 'Space Mono', monospace;
  font-size: 12px;
  color: rgba(245, 215, 66, 0.6);
}

/* ── CTA ── */
.cta-button {
  margin-top: 8px;
  background: #f5d742;
  color: #0f0f13;
  border: none;
  border-radius: 8px;
  padding: 14px 28px;
  font-family: 'Space Mono', monospace;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.03em;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.cta-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 215, 66, 0.4);
}

.cta-button:active {
  transform: translateY(0);
}

/* ── Responsive ── */
@media (max-width: 480px) {
  .overlay-content {
    padding: 24px 16px;
    gap: 12px;
  }

  .player-card {
    padding: 12px 14px;
  }

  .score-value {
    font-size: 22px;
  }

  .player-card--first .score-value {
    font-size: 26px;
  }
}
</style>
