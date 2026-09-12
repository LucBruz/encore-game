<template>
  <div class="page" :class="{ 'page--playing': started }">
    <!-- Écran de configuration -->
    <div v-if="!started" class="setup">
      <NuxtLink to="/" class="back">← Retour</NuxtLink>
      <h1>Partie solo</h1>
      <p class="lede">
        Affronte <strong>v3-multi</strong>, dont les poids d'évaluation ont été optimisés
        par entropie croisée <strong>directement en partie à 4 joueurs</strong>. Aucune connexion : tout tourne dans ton navigateur.
        <NuxtLink to="/ia" class="link">Voir le benchmark →</NuxtLink>
      </p>

      <label class="field">
        <span>Ton prénom</span>
        <input v-model="playerName" type="text" maxlength="20" placeholder="ex: Luc">
      </label>

      <div class="field">
        <span>Adversaires</span>
        <div class="chips">
          <button
            v-for="n in [1, 2, 3]"
            :key="n"
            class="chip"
            :class="{ 'chip--on': botCount === n }"
            @click="botCount = n"
          >{{ n }} bot{{ n > 1 ? 's' : '' }}</button>
        </div>
      </div>

      <div class="field">
        <span>Difficulté</span>
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
          Même politique pour les trois niveaux, dégradée par température et
          <strong>calibrée par mesure</strong> en partie à 4 joueurs :
          {{ DIFFICULTIES[difficulty].winRate }} % de victoires contre trois bots au niveau
          maximal, où le plafond théorique est 25 %.
        </p>
      </div>

      <div class="field">
        <span>Grille</span>
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
        Commencer →
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
            <span v-if="store.activePlayerId === p.id">🎲</span>
            {{ p.name }}
            <span class="pchip__score">{{ store.scoreForPlayer(p.id) }}</span>
          </button>
        </div>
        <div class="turn">tour {{ store.turnNumber + 1 }}</div>
      </header>

      <div class="layout">
        <div class="left">
          <GameDices
            :player-id="viewed"
            :readonly="viewed !== humanId || isBotThinking"
            @roll="onRoll"
            @confirm-active="(ci, ni, jc, jn) => store.confirmActiveCombo(ci, ni, jc, jn)"
            @confirm-passive="(pid, ci, ni, jc, jn) => store.confirmPassiveCombo(pid, ci, ni, jc, jn)"
            @pass-active="store.passActiveTurn()"
            @pass-passive="(pid) => store.passPassiveTurn(pid)"
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
              <span>score</span>
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
            @cell-click="(idx) => store.togglePendingCell(humanId, idx)"
            @confirm-placement="store.confirmPendingCells(humanId)"
            @cancel-placement="store.cancelPendingCells(humanId)"
          />
        </div>
      </div>

      <div v-if="store.gameOver" class="over">
        <h2>Partie terminée</h2>
        <ol>
          <li v-for="p in ranking" :key="p.id" :class="{ 'me': p.id === humanId }">
            <span>{{ p.name }}</span><strong>{{ store.scoreForPlayer(p.id) }} pts</strong>
          </li>
        </ol>
        <button class="btn-start" @click="restart">Rejouer</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore, rollAllDices } from '~/stores/gameStore'
import type { DicesRoll } from '~/stores/gameStore'
import { COLOR_MAP } from '~/data/grids/grid-01'
import type { ColorKey } from '~/data/grids/grid-01'
import { DIFFICULTIES, useBotPlayer } from '~/composables/useBotPlayer'
import type { DifficultyId } from '~/composables/useBotPlayer'

const GRID_IDS = ['01', '02', '03', '04', '05', '06', '07', '08']

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
  viewed.value = humanId
  started.value = true
  void drive()
}

function restart() {
  store.resetGame()
  store.initGrid(gridId.value)
  void drive()
}

function onRoll(roll: DicesRoll) {
  store.rollDicesWithResult(roll)
  void drive()
}

/** Joue un coup complet pour un bot : combo, placement, validation. */
function playBot(id: string): void {
  const decision = botPlayer.value.decide(store, id)
  const isActive = id === store.activePlayerId && store.phase === 'active_selecting'

  if (!decision) {
    if (isActive) store.passActiveTurn('no-placement')
    else store.passPassiveTurn(id, 'no-placement')
    return
  }

  if (isActive) {
    store.confirmActiveCombo(
      decision.colorDiceIndex, decision.numberDiceIndex, decision.jokerColor, decision.jokerCount,
    )
  } else {
    store.confirmPassiveCombo(
      id, decision.colorDiceIndex, decision.numberDiceIndex, decision.jokerColor, decision.jokerCount,
    )
  }

  // Le store a pu auto-passer si la combo n'offrait aucun placement.
  const player = store.players.find(p => p.id === id)
  if (!player?.confirmedCombo) return

  for (const idx of decision.placement) store.togglePendingCell(id, idx)
  store.confirmPendingCells(id)
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
        thinkingLabel.value = 'Le bot lance les dés...'
        await wait(650)
        store.rollDicesWithResult(rollAllDices())
        continue
      }

      if (store.phase === 'active_selecting') {
        if (store.activePlayerId === humanId) break
        isBotThinking.value = true
        thinkingLabel.value = 'Le bot choisit sa combinaison...'
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
          thinkingLabel.value = 'Le bot joue...'
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
        store.nextTurn()
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

.back {
  @apply text-xs font-bold uppercase tracking-wider transition-colors;
  color: #6e6e88;
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
  color: #6e6e88;
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
  color: #6e6e88;
}
.hint strong { color: #a0a0b8; }

.chips { @apply flex gap-1.5 flex-wrap; }

.chip {
  @apply px-3.5 py-2 rounded-lg text-sm font-black cursor-pointer transition-all;
  font-family: 'Space Mono', monospace;
  background: #23232f;
  border: 2px solid #2e2e3e;
  color: #6e6e88;
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
  color: #6e6e88;
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
  color: #6e6e88;
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
