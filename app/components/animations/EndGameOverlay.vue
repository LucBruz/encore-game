<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { COLOR_MAP, COLUMN_POINTS } from '~/data/grids/grid-01'
import type { ColorKey } from '~/data/grids/grid-01'

interface Player {
  name: string
  isLocal: boolean
  score: number
  colorBonus: Record<string, 'first' | 'others' | null>
  columnBonus: Record<string, 'first' | 'others' | null>
  jokers: number
  starMalus: number
  checkedCells: number[]
}

interface GridData {
  cells: [string, boolean][]
  jokers: number
}

const props = defineProps<{
  players: Player[]
  turnNumber?: number
  grid?: GridData
}>()
const emit = defineEmits<{ replay: [] }>()

const sortedPlayers = computed(() => [...props.players].sort((a, b) => b.score - a.score))
const winner = computed(() => sortedPlayers.value[0])
const maxScore = computed(() => Math.max(...props.players.map(p => p.score), 1))

// Vue grilles
const showGrids = ref(false)
const selectedGridIdx = ref(0)

// Couleurs dans l'ordre d'affichage
const COLOR_KEYS: ColorKey[] = ['g', 'y', 'b', 'p', 'o']

function colorBonusTotal(player: Player) {
  return Object.values(player.colorBonus).reduce((acc, v) => {
    return acc + (v === 'first' ? 5 : v === 'others' ? 3 : 0)
  }, 0)
}

function columnBonusTotal(player: Player) {
  return Object.entries(player.columnBonus).reduce((acc, [col, v]) => {
    if (v === 'first') return acc + (COLUMN_POINTS[col]?.first ?? 0)
    if (v === 'others') return acc + (COLUMN_POINTS[col]?.others ?? 0)
    return acc
  }, 0)
}

function completedColumns(player: Player) {
  return Object.entries(player.columnBonus)
    .filter(([_, v]) => v !== null)
    .map(([col, v]) => ({
      col,
      pts: v === 'first' ? (COLUMN_POINTS[col]?.first ?? 0) : (COLUMN_POINTS[col]?.others ?? 0),
      isFirst: v === 'first',
    }))
}

// Refs animation
const trophyRef = ref<HTMLElement | null>(null)
const winnerNameRef = ref<HTMLElement | null>(null)
const winnerSubRef = ref<HTMLElement | null>(null)
const ctaRef = ref<HTMLElement | null>(null)
const confettiRefs: HTMLElement[] = []
const cardRefs: HTMLElement[] = []
const scoreEls: HTMLElement[] = []
const barFillEls: HTMLElement[] = []

// Confettis
const CONF_COLORS = ['#5cc96e', '#f5d742', '#5b9ff5', '#e85a82', '#f58a35']
const confettis = Array.from({ length: 64 }, (_, i) => ({
  id: i,
  color: CONF_COLORS[i % CONF_COLORS.length],
  size: 6 + Math.floor(Math.random() * 9),
  isRound: i % 2 === 0,
  left: Math.random() * 100,
  initialY: -60 - Math.random() * 140,
}))

onMounted(async () => {
  if (!import.meta.client) return
  const gsap = (await import('gsap')).default
  const tl = gsap.timeline()
  const height = window.innerHeight

  gsap.set(trophyRef.value,    { scale: 0, rotate: -45, opacity: 0 })
  gsap.set(winnerNameRef.value, { opacity: 0, y: 40, scale: 0.9 })
  gsap.set(winnerSubRef.value,  { opacity: 0, y: 12 })
  gsap.set(cardRefs,            { opacity: 0, y: 30, scale: 0.95 })
  gsap.set(barFillEls,          { scaleX: 0, transformOrigin: 'left center' })
  gsap.set(confettiRefs,        { y: -60, opacity: 0, rotate: 0 })
  gsap.set(ctaRef.value,        { opacity: 0, y: 14 })
  scoreEls.forEach(el => { if (el) el.textContent = '0' })

  tl.to(trophyRef.value, {
    scale: 1, rotate: 0, opacity: 1, duration: 0.7, ease: 'back.out(2.5)'
  }, 0.1)
  .to(trophyRef.value, { rotate: -8, yoyo: true, repeat: 5, duration: 0.09, ease: 'power2.inOut' }, '>')
  .to(trophyRef.value, { rotate: 0, duration: 0.2 })

  tl.to(winnerNameRef.value, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.8)' }, 0.5)
    .to(winnerSubRef.value,  { opacity: 1, y: 0, duration: 0.4 }, '-=0.2')

  tl.to(cardRefs, {
    opacity: 1, y: 0, scale: 1, duration: 0.55, stagger: 0.12, ease: 'back.out(1.6)'
  }, 0.7)

  sortedPlayers.value.forEach((player, i) => {
    const obj = { val: 0 }
    tl.to(obj, {
      val: player.score,
      duration: 1.2,
      ease: 'power3.out',
      onUpdate: () => {
        if (scoreEls[i]) scoreEls[i]!.textContent = Math.round(obj.val).toString()
      },
    }, 0.95)
  })

  sortedPlayers.value.forEach((player, i) => {
    const barW = player.score / maxScore.value
    tl.to(barFillEls[i], { scaleX: barW, duration: 1, ease: 'power3.out' }, 1.0)
  })

  tl.to(confettiRefs, { opacity: 1, duration: 0.15 }, 0.7)
  tl.to(confettiRefs, {
    y: height + 40,
    rotate: () => gsap.utils.random(-540, 540),
    duration: () => gsap.utils.random(1.6, 2.8),
    ease: 'power1.in',
    stagger: { each: 0.02, from: 'random' },
  }, 0.7)

  tl.to(ctaRef.value, { opacity: 1, y: 0, duration: 0.45 }, '-=0.5')
})
</script>

<template>
  <div class="end-game-overlay">
    <!-- Confettis -->
    <div
      v-for="c in confettis"
      :key="c.id"
      :ref="(el) => { if (el) confettiRefs[c.id] = el as HTMLElement }"
      class="conf"
      :class="{ circ: c.isRound }"
      :style="{
        left: c.left + '%',
        top: c.initialY + 'px',
        width: c.size + 'px',
        height: c.size + 'px',
        background: c.color,
      }"
    />

    <!-- Contenu principal -->
    <div class="overlay-content">

      <!-- Trophée SVG -->
      <div ref="trophyRef" class="trophy" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="80" height="80">
          <defs>
            <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stop-color="#f5d742" />
              <stop offset="100%" stop-color="#f58a35" />
            </linearGradient>
          </defs>
          <path d="M14 8 h36 v10 c0 8 -5 14 -12 16 v6 h6 v6 H20 v-6 h6 v-6 c-7 -2 -12 -8 -12 -16 z" fill="url(#tg)" />
          <path d="M14 14 h-6 c-2 0 -2 4 0 6 c2 2 6 2 6 0" fill="none" stroke="#f5d742" stroke-width="2" />
          <path d="M50 14 h6 c2 0 2 4 0 6 c-2 2 -6 2 -6 0"  fill="none" stroke="#f5d742" stroke-width="2" />
          <rect x="16" y="50" width="32" height="6" fill="url(#tg)" />
        </svg>
      </div>

      <!-- Nom du gagnant -->
      <h1 ref="winnerNameRef" class="winner-name">
        {{ winner?.name }} gagne <span class="acc">!</span>
      </h1>
      <div ref="winnerSubRef" class="endgame-sub">
        <template v-if="turnNumber != null">Tour {{ turnNumber + 1 }} · </template>Fin de partie
      </div>

      <!-- Cartes joueurs -->
      <div class="endgame-board">
        <div
          v-for="(player, i) in sortedPlayers"
          :key="player.name"
          :ref="(el) => { if (el) cardRefs[i] = el as HTMLElement }"
          class="player-card"
          :class="{ 'player-card--winner': i === 0 }"
        >
          <!-- Rang -->
          <div class="pc-rank" :class="{ 'pc-rank--dim': i > 0 }">
            <template v-if="i === 0">1<sup>er</sup></template>
            <template v-else>{{ i + 1 }}</template>
          </div>

          <!-- Infos -->
          <div class="pc-body">
            <div class="pc-top">
              <span class="pc-name">
                {{ player.name }}
                <span v-if="player.isLocal" class="pc-tag">toi</span>
              </span>
              <span v-if="i === 0" class="pc-medal">★</span>
            </div>

            <!-- Barre -->
            <div class="pc-bar">
              <div
                :ref="(el) => { if (el) barFillEls[i] = el as HTMLElement }"
                class="pc-bar-fill"
                :class="{ 'pc-bar-fill--dim': i > 0 }"
              />
            </div>

            <!-- Détail couleurs -->
            <div class="pc-colors">
              <span
                v-for="ck in COLOR_KEYS"
                :key="ck"
                class="pc-color-dot"
                :class="{
                  'pc-color-dot--first': player.colorBonus[ck] === 'first',
                  'pc-color-dot--others': player.colorBonus[ck] === 'others',
                  'pc-color-dot--none': player.colorBonus[ck] === null,
                }"
                :style="{ background: player.colorBonus[ck] !== null ? COLOR_MAP[ck].hex : undefined }"
                :title="`${ck.toUpperCase()} : ${player.colorBonus[ck] === 'first' ? '+5' : player.colorBonus[ck] === 'others' ? '+3' : '—'}`"
              />
              <span class="pc-score-part">{{ colorBonusTotal(player) }} pts</span>
            </div>

            <!-- Détail colonnes -->
            <div v-if="completedColumns(player).length > 0" class="pc-columns">
              <span
                v-for="col in completedColumns(player)"
                :key="col.col"
                class="pc-col-chip"
                :class="{ 'pc-col-chip--first': col.isFirst }"
              >{{ col.col }} +{{ col.pts }}</span>
              <span class="pc-score-part">{{ columnBonusTotal(player) }} pts</span>
            </div>

            <!-- Jokers + étoiles -->
            <div class="pc-extras">
              <span class="pc-extra">⬟ {{ player.jokers }} joker{{ player.jokers !== 1 ? 's' : '' }} +{{ player.jokers }}</span>
              <span class="pc-extra" :class="{ 'pc-extra--neg': player.starMalus < 0 }">
                ★ {{ player.starMalus < 0 ? player.starMalus : '—' }}
              </span>
            </div>
          </div>

          <!-- Score -->
          <div class="pc-num" :class="{ 'pc-num--dim': i > 0 }">
            <span :ref="(el) => { if (el) scoreEls[i] = el as HTMLElement }">0</span>
            <span class="pc-unit">pts</span>
          </div>
        </div>
      </div>

      <!-- Bouton voir les grilles -->
      <button class="btn-grids" @click="showGrids = !showGrids">
        {{ showGrids ? '↑ Masquer les grilles' : '⊞ Voir les grilles' }}
      </button>

      <!-- Section grilles -->
      <div v-if="showGrids && grid" class="grids-section">
        <!-- Onglets joueurs -->
        <div class="grids-tabs">
          <button
            v-for="(player, i) in sortedPlayers"
            :key="player.name"
            class="grid-tab"
            :class="{ 'grid-tab--active': selectedGridIdx === i }"
            @click="selectedGridIdx = i"
          >
            {{ player.name }}
          </button>
        </div>

        <!-- Grille readonly -->
        <div class="grid-view">
          <GameGrid
            :grid="grid as any"
            :checked-cells="new Set(sortedPlayers[selectedGridIdx].checkedCells)"
            :pending-cells="[]"
            :valid-cells="new Set()"
            :column-bonus="sortedPlayers[selectedGridIdx].columnBonus as any"
            :confirmed-combo="null"
            :placement-error="null"
            :is-blocked-mode="false"
            :readonly="true"
          />
        </div>
      </div>

      <!-- CTA -->
      <div ref="ctaRef" class="endgame-cta-wrap">
        <button class="endgame-cta" @click="emit('replay')">
          Rejouer une partie →
        </button>
      </div>

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
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  padding: 24px 16px 40px;
}

/* ── Confettis ── */
.conf {
  position: fixed;
  border-radius: 2px;
  pointer-events: none;
  will-change: transform;
  top: 0;
}
.conf.circ { border-radius: 50%; }

/* ── Contenu ── */
.overlay-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 660px;
  width: 100%;
}

/* ── Trophée ── */
.trophy {
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 4px 20px rgba(245, 215, 66, 0.5));
  user-select: none;
}

/* ── Nom gagnant ── */
.winner-name {
  font-family: 'Space Mono', monospace;
  font-size: clamp(28px, 6vw, 48px);
  font-weight: 700;
  margin: 0;
  line-height: 1.1;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-align: center;
}
.acc {
  color: #f58a35;
  -webkit-text-fill-color: #f58a35;
}

.endgame-sub {
  font-family: 'Space Mono', monospace;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6e6e88;
  margin: 0;
}

/* ── Board ── */
.endgame-board {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

/* ── Carte joueur ── */
.player-card {
  display: grid;
  grid-template-columns: 52px 1fr 90px;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: #23232f;
  border: 1px solid #2e2e3e;
  border-radius: 14px;
}
.player-card--winner {
  border-color: #f5d742;
  background: linear-gradient(135deg, rgba(245, 215, 66, 0.07), rgba(245, 138, 53, 0.03));
  box-shadow: 0 0 20px rgba(245, 215, 66, 0.1);
}

/* ── Rang ── */
.pc-rank {
  font-family: 'Space Mono', monospace;
  font-weight: 700;
  font-size: 28px;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
  text-align: center;
}
.pc-rank sup { font-size: 12px; -webkit-text-fill-color: #f58a35; vertical-align: super; }
.pc-rank--dim { background: none; -webkit-text-fill-color: #6e6e88; color: #6e6e88; font-size: 24px; }

/* ── Corps ── */
.pc-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.pc-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pc-name {
  font-family: 'Space Mono', monospace;
  font-weight: 700;
  font-size: 13px;
  color: #e8e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-tag {
  font-family: 'Nunito', sans-serif;
  font-size: 10px;
  color: #f5d742;
  background: rgba(245, 215, 66, 0.15);
  padding: 2px 7px;
  border-radius: 99px;
  margin-left: 2px;
}
.pc-medal { color: #f5d742; font-size: 14px; }

/* ── Barre ── */
.pc-bar {
  height: 6px;
  background: #1a1a24;
  border-radius: 99px;
  overflow: hidden;
  border: 1px solid #2e2e3e;
}
.pc-bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #f5d742, #f58a35);
  border-radius: 99px;
  transform-origin: left center;
}
.pc-bar-fill--dim { background: linear-gradient(90deg, #3e3e52, #6e6e88); }

/* ── Couleurs ── */
.pc-colors {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.pc-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid transparent;
  flex-shrink: 0;
}
.pc-color-dot--first { border-color: white; }
.pc-color-dot--others { opacity: 0.6; border-color: rgba(255,255,255,0.3); }
.pc-color-dot--none { background: #2e2e3e !important; opacity: 0.35; }

.pc-score-part {
  font-family: 'Space Mono', monospace;
  font-size: 10px;
  color: #6e6e88;
  margin-left: 3px;
}

/* ── Colonnes ── */
.pc-columns {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.pc-col-chip {
  font-family: 'Space Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 5px;
  background: rgba(91, 159, 245, 0.12);
  color: #5b9ff5;
  border: 1px solid rgba(91, 159, 245, 0.25);
}
.pc-col-chip--first {
  background: rgba(92, 201, 110, 0.12);
  color: #5cc96e;
  border-color: rgba(92, 201, 110, 0.25);
}

/* ── Extras (jokers + étoiles) ── */
.pc-extras {
  display: flex;
  gap: 10px;
}
.pc-extra {
  font-family: 'Nunito', sans-serif;
  font-size: 11px;
  color: #9a9ab0;
}
.pc-extra--neg { color: #e85a82; }

/* ── Score ── */
.pc-num {
  font-family: 'Space Mono', monospace;
  font-weight: 700;
  font-size: 34px;
  text-align: right;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.pc-num--dim {
  background: none;
  -webkit-text-fill-color: #6e6e88;
  color: #6e6e88;
  font-size: 28px;
}
.pc-unit {
  font-size: 10px;
  color: rgba(245, 215, 66, 0.55);
  -webkit-text-fill-color: rgba(245, 215, 66, 0.55);
  font-weight: 400;
}
.pc-num--dim .pc-unit { color: #6e6e88; -webkit-text-fill-color: #6e6e88; }

/* ── Bouton voir grilles ── */
.btn-grids {
  padding: 9px 20px;
  border-radius: 8px;
  border: 1px solid #3e3e52;
  background: rgba(232, 232, 240, 0.04);
  color: #9a9ab0;
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.btn-grids:hover { border-color: #6e6e88; color: #e8e8f0; }

/* ── Section grilles ── */
.grids-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.grids-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.grid-tab {
  padding: 6px 14px;
  border-radius: 99px;
  border: 1px solid #2e2e3e;
  background: transparent;
  color: #6e6e88;
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.grid-tab--active {
  border-color: #f5d742;
  color: #f5d742;
  background: rgba(245, 215, 66, 0.08);
}
.grid-view {
  background: #1a1a24;
  border: 1px solid #2e2e3e;
  border-radius: 12px;
  padding: 16px;
  overflow-x: auto;
}

/* ── CTA ── */
.endgame-cta-wrap { width: 100%; display: flex; justify-content: center; }
.endgame-cta {
  padding: 14px 28px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  color: #0f0f13;
  font-family: 'Space Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.endgame-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 215, 66, 0.35);
}
.endgame-cta:active { transform: translateY(0); }

/* ── Responsive ── */
@media (max-width: 520px) {
  .player-card { grid-template-columns: 44px 1fr 70px; gap: 10px; padding: 12px 12px; }
  .pc-rank { font-size: 22px; }
  .pc-rank--dim { font-size: 20px; }
  .pc-num { font-size: 26px; }
  .pc-num--dim { font-size: 22px; }
  .winner-name { font-size: 26px; }
}
</style>
