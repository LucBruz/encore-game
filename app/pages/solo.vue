<template>
  <div class="page" :class="{ 'page--playing': started }">
    <!-- Écran de configuration -->
    <div v-if="!started" class="setup">
      <div class="setup-top">
        <NuxtLink to="/" class="back">{{ $t('common.back') }}</NuxtLink>
        <LangSwitch />
      </div>
      <h1>{{ $t('solo.title') }}</h1>
      <p class="lede">
        <i18n-t keypath="solo.lede" scope="global">
          <template #bot><strong>v3-multi</strong></template>
          <template #tuning><strong>{{ $t('solo.ledeTuning') }}</strong></template>
        </i18n-t>
        <NuxtLink to="/ia" class="link">{{ $t('solo.seeBenchmark') }}</NuxtLink>
      </p>

      <label class="field">
        <span>{{ $t('common.firstName') }}</span>
        <input v-model="playerName" type="text" maxlength="20" :placeholder="$t('solo.namePlaceholder')">
      </label>

      <div class="field">
        <span>{{ $t('solo.opponents') }}</span>
        <div class="chips">
          <button
            v-for="n in [1, 2, 3]"
            :key="n"
            class="chip"
            :class="{ 'chip--on': botCount === n }"
            @click="botCount = n"
          >{{ $t('solo.botCount', n, { count: n }) }}</button>
        </div>
      </div>

      <div class="field">
        <span>{{ $t('solo.difficulty') }}</span>
        <div class="chips">
          <button
            v-for="(d, id) in DIFFICULTIES"
            :key="id"
            class="chip"
            :class="{ 'chip--on': difficulty === id }"
            @click="difficulty = id as DifficultyId"
          >{{ d.label }}</button>
        </div>
        <p class="hint">
          <i18n-t keypath="solo.difficultyHint" scope="global">
            <template #calibrated><strong>{{ $t('solo.difficultyCalibrated') }}</strong></template>
            <template #rate>{{ DIFFICULTIES[difficulty].winRate }}</template>
          </i18n-t>
        </p>
      </div>

      <div class="field">
        <span>{{ $t('common.grid') }}</span>
        <div class="chips">
          <button
            v-for="g in GRID_IDS"
            :key="g"
            class="chip"
            :class="{ 'chip--on': gridId === g }"
            @click="gridId = g"
          >{{ g }}</button>
        </div>
      </div>

      <button class="btn-start" :disabled="!playerName.trim()" @click="start">
        {{ $t('solo.start') }}
      </button>
    </div>

    <!-- Partie -->
    <div v-else class="game">
      <header class="game-header">
        <h1 class="title">ENCORE!</h1>
        <div class="chips-players">
          <button
            v-for="p in store.players"
            :key="p.id"
            class="pchip"
            :class="{
              'pchip--view': viewed === p.id,
              'pchip--active': store.activePlayerId === p.id,
            }"
            @click="viewed = p.id"
          >
            {{ p.name }}
            <span class="pchip__score">{{ store.scoreForPlayer(p.id) }}</span>
          </button>
        </div>
        <LangSwitch />
        <div class="turn">{{ $t('solo.turn', { n: store.turnNumber + 1 }) }}</div>
      </header>

      <div class="layout">
        <div class="left">
          <GameDices
            :player-id="viewed"
            :readonly="viewed !== humanId || isBotThinking"
            @roll="onRoll"
            @confirm-active="(ci, ni, jc, jn) => play('CONFIRM_ACTIVE', { colorDiceIndex: ci, numberDiceIndex: ni, jokerColor: jc, jokerCount: jn })"
            @confirm-passive="(pid, ci, ni, jc, jn) => play('CONFIRM_PASSIVE', { playerId: pid, colorDiceIndex: ci, numberDiceIndex: ni, jokerColor: jc, jokerCount: jn })"
            @pass-active="play('PASS_ACTIVE', {})"
            @pass-passive="(pid) => play('PASS_PASSIVE', { playerId: pid })"
          />

          <div v-if="isBotThinking" class="thinking">
            {{ thinkingLabel }}
          </div>

          <div v-if="viewedPlayer" class="info">
            <div class="info__row">
              <span class="info__name">{{ viewedPlayer.name }}</span>
              <span v-if="viewedPlayer.confirmedCombo" class="combo">
                <i :style="{ background: COLOR_MAP[viewedPlayer.confirmedCombo.color as ColorKey]?.hex }" />
                × {{ viewedPlayer.confirmedCombo.count }}
              </span>
            </div>
            <GameJokers :total="store.grid.jokers" :used="viewedPlayer.jokersUsed" />
            <div class="score">
              <span>{{ $t('solo.score') }}</span>
              <strong>{{ store.scoreForPlayer(viewedPlayer.id) }}</strong>
            </div>
          </div>
        </div>

        <div v-if="viewedPlayer" class="right">
          <GameGrid
            :grid="store.grid"
            :checked-cells="viewedPlayer.checkedCells"
            :pending-cells="viewedPlayer.pendingCells"
            :valid-cells="store.validCellsForPlayer(viewedPlayer.id)"
            :column-bonus="viewedPlayer.columnBonus"
            :confirmed-combo="viewedPlayer.confirmedCombo"
            :placement-error="viewed === humanId ? store.placementError : null"
            :is-blocked-mode="!!viewedPlayer.confirmedCombo && !viewedPlayer.hasPlaced"
            :readonly="viewed !== humanId"
            @cell-click="(idx) => play('TOGGLE_CELL', { playerId: humanId, cellIdx: idx })"
            @confirm-placement="play('CONFIRM_PLACEMENT', { playerId: humanId })"
            @cancel-placement="play('CANCEL_PLACEMENT', { playerId: humanId })"
          />
        </div>
      </div>

      <div v-if="store.gameOver" class="over">
        <h2>{{ $t('solo.over') }}</h2>
        <ol>
          <li v-for="p in ranking" :key="p.id" :class="{ 'me': p.id === humanId }">
            <span>{{ p.name }}</span><strong>{{ $t('solo.points', { n: store.scoreForPlayer(p.id) }) }}</strong>
          </li>
        </ol>
        <button class="btn-start" @click="restart">{{ $t('solo.replay') }}</button>

        <!-- Analyse de la partie. Le mode solo ne passe pas par Supabase : le
             journal des coups tenu ci-dessous suffit, c'est le meme format. -->
        <button class="btn-review" @click="showReview = !showReview">
          {{ showReview ? $t('solo.hideAnalysis') : $t('solo.analyse') }}
        </button>
        <div v-if="showReview" class="review-section">
          <LazyGameReview
            :local="{ players: reviewPlayers, gridId, events: log }"
            :default-player-id="humanId"
            autostart
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore, rollAllDices } from '~/stores/gameStore'
import type { DicesRoll } from '~/stores/gameStore'
import { applyGameAction } from '~/utils/applyGameAction'
import type { GameActionType } from '~/services/realtimeService'
import { COLOR_MAP } from '~/data/grids/grid-01'
import type { ColorKey } from '~/data/grids/grid-01'
import { DIFFICULTIES, useBotPlayer } from '~/composables/useBotPlayer'
import type { DifficultyId } from '~/composables/useBotPlayer'

const GRID_IDS = ['01', '02', '03', '04', '05', '06', '07', '08']

const { t } = useI18n()
const store = useGameStore()
const difficulty = ref<DifficultyId>('medium')
// Recree le bot quand le niveau change : la temperature est fixee a la construction.
const botPlayer = computed(() => useBotPlayer(difficulty.value))

const started = ref(false)
const playerName = ref('')
const botCount = ref(1)
const gridId = ref('01')
const humanId = 'p-human'
const viewed = ref(humanId)
const isBotThinking = ref(false)
const thinkingLabel = ref('')

const viewedPlayer = computed(() => store.players.find(p => p.id === viewed.value))
const botIds = computed(() => store.players.filter(p => p.id !== humanId).map(p => p.id))
const ranking = computed(() =>
  [...store.players].sort((a, b) => store.scoreForPlayer(b.id) - store.scoreForPlayer(a.id)),
)

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Journal des coups, au format de `game_events`. Le mode solo joue en memoire,
 * sans reseau ni base : sans ce journal, l'analyse d'apres-partie n'aurait rien
 * a relire. Les coups passent donc par `applyGameAction`, exactement comme en
 * multijoueur, de sorte que ce qui est rejoue est ce qui a ete joue.
 */
const log = ref<{ event_type: GameActionType; payload: Record<string, unknown> }[]>([])
const showReview = ref(false)
const reviewPlayers = computed(() => store.players.map(p => ({ id: p.id, name: p.name })))

function play(type: GameActionType, payload: Record<string, unknown> = {}) {
  log.value.push({ event_type: type, payload })
  applyGameAction(store, type, payload)
}

function start() {
  const players = [
    { id: humanId, name: playerName.value.trim() || 'Toi' },
    ...Array.from({ length: botCount.value }, (_, i) => ({
      id: `bot-${i + 1}`,
      name: botCount.value === 1
        ? DIFFICULTIES[difficulty.value].label
        : `${DIFFICULTIES[difficulty.value].label} #${i + 1}`,
    })),
  ]
  store.initPlayers(players)
  store.initGrid(gridId.value)
  log.value = []
  showReview.value = false
  viewed.value = humanId
  started.value = true
  void drive()
}

function restart() {
  store.resetGame()
  store.initGrid(gridId.value)
  log.value = []
  showReview.value = false
  void drive()
}

function onRoll(roll: DicesRoll) {
  play('ROLL_DICES', { roll })
  void drive()
}

/** Joue un coup complet pour un bot : combo, placement, validation. */
function playBot(id: string): void {
  const decision = botPlayer.value.decide(store, id)
  const isActive = id === store.activePlayerId && store.phase === 'active_selecting'

  if (!decision) {
    if (isActive) play('PASS_ACTIVE', { reason: 'no-placement' })
    else play('PASS_PASSIVE', { playerId: id, reason: 'no-placement' })
    return
  }

  const combo = {
    colorDiceIndex: decision.colorDiceIndex, numberDiceIndex: decision.numberDiceIndex,
    jokerColor: decision.jokerColor, jokerCount: decision.jokerCount,
  }
  if (isActive) play('CONFIRM_ACTIVE', combo)
  else play('CONFIRM_PASSIVE', { playerId: id, ...combo })

  // Le store a pu auto-passer si la combo n'offrait aucun placement.
  const player = store.players.find(p => p.id === id)
  if (!player?.confirmedCombo) return

  for (const idx of decision.placement) play('TOGGLE_CELL', { playerId: id, cellIdx: idx })
  play('CONFIRM_PLACEMENT', { playerId: id })
}

/**
 * Boucle de pilotage : fait avancer la partie tant que c'est au tour d'un bot ou
 * qu'une transition automatique est en attente. Rend la main des que le joueur
 * humain doit agir.
 */
let driving = false
async function drive(): Promise<void> {
  if (driving) return
  driving = true
  try {
    for (let guard = 0; guard < 200; guard++) {
      if (store.gameOver && store.phase === 'turn_end') break

      if (store.phase === 'waiting_roll') {
        if (store.activePlayerId === humanId || store.isFirstThreeTurns) break
        isBotThinking.value = true
        thinkingLabel.value = t('solo.botRolling')
        await wait(650)
        play('ROLL_DICES', { roll: rollAllDices() })
        continue
      }

      if (store.phase === 'active_selecting') {
        if (store.activePlayerId === humanId) break
        isBotThinking.value = true
        thinkingLabel.value = t('solo.botChoosing')
        await wait(700)
        playBot(store.activePlayerId)
        continue
      }

      if (store.phase === 'passive_selecting') {
        const pending = botIds.value.filter(id => {
          const p = store.players.find(x => x.id === id)
          return p && !p.hasPlaced && !p.hasPassed
        })
        if (pending.length > 0) {
          isBotThinking.value = true
          thinkingLabel.value = t('solo.botPlaying')
          await wait(600)
          playBot(pending[0])
          continue
        }
        isBotThinking.value = false
        const human = store.players.find(p => p.id === humanId)
        if (human && !human.hasPlaced && !human.hasPassed) break
        // L'humain a joué et tous les bots aussi : le store bascule seul en turn_end.
        if (store.phase !== 'turn_end') break
        continue
      }

      if (store.phase === 'turn_end') {
        isBotThinking.value = false
        if (store.gameOver) break
        await wait(900)
        play('NEXT_TURN', {})
        continue
      }

      break
    }
  } finally {
    isBotThinking.value = false
    driving = false
  }
}

// Toute transition de phase peut débloquer un bot : on relance le pilote.
watch(() => store.phase, () => { if (started.value) void drive() })
watch(() => store.players.map(p => `${p.hasPlaced}${p.hasPassed}`).join(), () => {
  if (started.value) void drive()
})
</script>

<style scoped>
/* Charte identique au reste du jeu : fond #0f0f13, cartes #1a1a24,
   encarts #23232f, bordures #2e2e3e, Nunito pour le texte et Space Mono
   pour tout ce qui est chiffre. */
.page {
  @apply min-h-screen mx-auto px-4 py-10;
  max-width: 1120px;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

/* En jeu, la page s'etale : l'ecran de configuration, lui, n'a rien a gagner
   a s'etirer sur 1920 px. */
.page--playing {
  @apply py-6;
  max-width: min(1760px, 100%);
}

.setup-top {
  @apply flex items-center justify-between gap-3 mb-1;
}

.back {
  @apply text-xs font-bold uppercase tracking-wider transition-colors;
  color: #8f8fa3;
}
.back:hover { color: #f5d742; }

.link { color: #5b9ff5; font-weight: 700; }
.link:hover { text-decoration: underline; }

/* ── Ecran de configuration ───────────────────────────────────────────────── */

.setup {
  @apply mx-auto flex flex-col gap-5 p-6 rounded-2xl;
  max-width: 540px;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.setup h1 {
  @apply text-4xl font-black tracking-tight;
  font-family: 'Space Mono', monospace;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.lede { @apply text-sm leading-relaxed; color: #a0a0b8; }

.field { @apply flex flex-col gap-2; }

.field > span {
  @apply text-xs font-bold uppercase tracking-wider;
  color: #8f8fa3;
}

.field input {
  @apply w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all;
  background: #23232f;
  border: 1px solid #2e2e3e;
  color: #e8e8f0;
}
.field input:focus { border-color: #f5d742; }
.field input::placeholder { color: #3e3e52; }

.hint {
  @apply text-xs leading-relaxed p-3 rounded-xl;
  background: #23232f;
  border-left: 3px solid #5b9ff5;
  color: #8f8fa3;
}
.hint strong { color: #a0a0b8; }

.chips { @apply flex gap-1.5 flex-wrap; }

.chip {
  @apply px-3.5 py-2 rounded-lg text-sm font-black cursor-pointer transition-all;
  font-family: 'Space Mono', monospace;
  background: #23232f;
  border: 2px solid #2e2e3e;
  color: #8f8fa3;
}

.chip:hover { border-color: #6e6e88; color: #e8e8f0; }

.chip--on {
  border-color: #f5d742;
  background: rgba(245, 215, 66, 0.1);
  color: #f5d742;
}

.btn-start {
  @apply px-5 py-2.5 rounded-xl font-black text-sm cursor-pointer transition-all;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  color: #0f0f13;
  border: none;
}

.btn-start:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.btn-start:disabled { @apply opacity-40 cursor-not-allowed; }

.btn-review {
  @apply mt-3 px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all;
  background: #23232f;
  color: #e8e8f0;
  border: 1px solid #2e2e3e;
}

.btn-review:hover {
  border-color: #f5d742;
  color: #f5d742;
}

.review-section {
  @apply mt-4 w-full text-left;
}

/* ── Partie ───────────────────────────────────────────────────────────────── */

.game-header {
  @apply flex items-center gap-4 flex-wrap mb-6 pb-4;
  border-bottom: 1px solid #2e2e3e;
}

.title {
  @apply text-2xl font-black tracking-tight;
  font-family: 'Space Mono', monospace;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.chips-players { @apply flex gap-2 flex-wrap; }

.pchip {
  @apply px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-2 transition-all;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
  color: #a0a0b8;
}

.pchip:hover { border-color: #3e3e52; }
.pchip--view { border-color: #f5d742; color: #e8e8f0; }
.pchip--active { background: #23232f; }

.pchip__score {
  @apply font-black;
  color: #5cc96e;
  font-family: 'Space Mono', monospace;
}

.turn {
  @apply ml-auto text-xs font-bold uppercase tracking-wider;
  color: #8f8fa3;
  font-family: 'Space Mono', monospace;
}

.layout { @apply grid gap-5; grid-template-columns: minmax(290px, 350px) 1fr; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }

.left { @apply flex flex-col gap-4; }

.thinking {
  @apply text-xs font-bold px-4 py-2.5 rounded-xl;
  background: rgba(91, 159, 245, 0.12);
  border: 1px solid rgba(91, 159, 245, 0.35);
  color: #5b9ff5;
}

.info {
  @apply flex flex-col gap-3 p-4 rounded-2xl;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.info__row { @apply flex items-center justify-between; }
.info__name { @apply text-sm font-black; color: #e8e8f0; }

.combo {
  @apply flex items-center gap-2 text-xs font-black px-2.5 py-1 rounded-lg;
  background: #23232f;
  font-family: 'Space Mono', monospace;
}
.combo i { @apply inline-block rounded; width: 13px; height: 13px; }

.score {
  @apply flex items-center justify-between text-xs font-bold uppercase tracking-wider pt-3;
  border-top: 1px solid #2e2e3e;
  color: #8f8fa3;
}

.score strong {
  @apply text-2xl font-black;
  color: #5cc96e;
  font-family: 'Space Mono', monospace;
}

/* ── Fin de partie ────────────────────────────────────────────────────────── */

.over {
  @apply mt-6 p-6 rounded-2xl flex flex-col gap-4;
  background: #1a1a24;
  border: 1px solid #5cc96e;
}

.over h2 {
  @apply text-xl font-black;
  color: #f5d742;
  font-family: 'Space Mono', monospace;
}

.over ol { @apply flex flex-col gap-1.5; }

.over li {
  @apply flex justify-between items-center text-sm px-3 py-2 rounded-xl;
  background: #23232f;
  border: 1px solid #2e2e3e;
  color: #a0a0b8;
}

.over li strong {
  @apply font-black;
  font-family: 'Space Mono', monospace;
  color: #e8e8f0;
}

.over li.me { border-color: #5cc96e; }
.over li.me strong { color: #5cc96e; }
</style>
