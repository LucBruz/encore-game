<template>
  <!-- Message d'attente EN DEHORS du panneau -->
  <p v-if="waitingMessage" class="dice-wait-text">{{ waitingMessage }}</p>

  <div class="dices-panel" :class="{ 'dices-panel--readonly': readonly }">

    <!-- Phase : en attente du lancer -->
    <div v-if="store.phase === 'waiting_roll'" class="dices-panel__intro">
      <button
        v-if="isActivePlayer || store.isFirstThreeTurns"
        class="btn-roll"
        :class="{ 'btn-roll--rolling': isRolling }"
        :disabled="readonly"
        @click="handleRoll"
      >
        <span class="btn-roll__icon">🎲</span>
        <span>Lancer les dés</span>
      </button>
    </div>

    <!-- Phase : dés lancés -->
    <div v-else-if="store.currentRoll" class="dices-panel__rolled">

      <div class="dices-main">
        <!-- Colonne gauche : joker pickers verticaux -->
        <div v-if="selectedColorIsJoker || selectedNumberIsJoker" class="joker-sidebar">
          <div v-if="selectedColorIsJoker" class="joker-sidebar__section">
            <span class="joker-sidebar__label">Couleur</span>
            <div class="joker-sidebar__colors">
              <button
                v-for="c in COLOR_KEYS"
                :key="c"
                class="joker-picker__color"
                :class="{ 'joker-picker__color--selected': jokerColor === c }"
                :style="{ background: COLOR_MAP[c].hex }"
                @click="jokerColor = c"
              />
            </div>
          </div>
          <div v-if="selectedNumberIsJoker" class="joker-sidebar__section">
            <span class="joker-sidebar__label">Valeur</span>
            <div class="joker-sidebar__numbers">
              <button
                v-for="n in [1, 2, 3, 4, 5]"
                :key="n"
                class="joker-picker__number"
                :class="{ 'joker-picker__number--selected': jokerCount === n }"
                @click="jokerCount = n"
              >{{ n }}</button>
            </div>
          </div>
        </div>

        <!-- Colonne droite : dés -->
        <div class="dices-column">
          <!-- Rangée couleur -->
          <div class="dices-row">
            <GameDice
              v-for="(dice, i) in colorDices"
              :key="`c-${i}`"
              type="color"
              :value="dice.value"
              :selected="canSelect && selectedColor === i"
              :selectable="canSelect"
              :spinning="isSpinning"
              :style="dimmedColor(i) ? { opacity: '0.2', filter: 'grayscale(0.7)', pointerEvents: 'none', transition: 'opacity 0.3s, filter 0.3s' } : {}"
              @select="selectColor(i)"
            />
          </div>

          <!-- Rangée chiffre -->
          <div class="dices-row">
            <GameDice
              v-for="(dice, i) in numberDices"
              :key="`n-${i}`"
              type="number"
              :value="dice.value"
              :selected="canSelect && selectedNumber === i"
              :selectable="canSelect"
              :spinning="isSpinning"
              :style="dimmedNumber(i) ? { opacity: '0.2', filter: 'grayscale(0.7)', pointerEvents: 'none', transition: 'opacity 0.3s, filter 0.3s' } : {}"
              @select="selectNumber(i)"
            />
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="dices-actions">
        <button
          v-if="canSelect"
          class="btn-pass"
          :disabled="readonly"
          @click="handlePass"
        >Passer</button>
        <button
          v-else-if="hasConfirmed && !currentPlayer?.hasPlaced"
          class="btn-pass"
          :disabled="readonly"
          @click="handlePass"
        >Passer</button>
        <button
          v-if="canSelect && comboIsReady"
          class="btn-confirm"
          @click="confirmCombo"
        >✓ Confirmer</button>
      </div>

      <!-- Badge phase bas-droite -->
      <div class="dices-badge">
        <span v-if="store.phase === 'turn_end'" class="badge badge--done">✓ Tour suivant...</span>
        <span v-else-if="store.isFirstThreeTurns" class="badge badge--special">⚡ Tours 1–3</span>
        <span v-else-if="isActivePlayer && store.phase === 'active_selecting'" class="badge badge--active">Joueur actif</span>
        <span v-else-if="hasConfirmed && !currentPlayer?.hasPlaced" class="badge badge--active">Place sur la grille</span>
        <span v-else-if="hasConfirmed && currentPlayer?.hasPlaced" class="badge badge--done">✓ En attente...</span>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useGameStore, rollAllDices } from '~/stores/gameStore'
import { COLOR_MAP } from '~/data/grids/grid-01'
import type { ColorKey } from '~/data/grids/grid-01'
import type { DiceColor, DiceNumber } from '~/stores/gameStore'

const COLOR_KEYS = Object.keys(COLOR_MAP) as ColorKey[]

const props = defineProps<{
  playerId: string
  readonly?: boolean
}>()

const emit = defineEmits<{
  pass: []
  'combo-confirmed': [colorDiceIndex: number, numberDiceIndex: number]
  'switch-to-player': [playerId: string]
  'roll': [roll: import('~/stores/gameStore').DicesRoll]
  'confirm-active': [colorDiceIndex: number, numberDiceIndex: number, jokerColor: ColorKey | undefined, jokerCount: number | undefined]
  'confirm-passive': [playerId: string, colorDiceIndex: number, numberDiceIndex: number, jokerColor: ColorKey | undefined, jokerCount: number | undefined]
  'pass-active': []
  'pass-passive': [playerId: string]
}>()

const store = useGameStore()

const isRolling = ref(false)
const isSpinning = ref(false)
const selectedColor = ref<number | null>(null)
const selectedNumber = ref<number | null>(null)
const jokerColor = ref<ColorKey | null>(null)
const jokerCount = ref<number | null>(null)

const isActivePlayer = computed(() => store.activePlayerId === props.playerId)

const activePlayerName = computed(() =>
  store.players.find(p => p.id === store.activePlayerId)?.name ?? ''
)

const currentPlayer = computed(() =>
  store.players.find(p => p.id === props.playerId)
)

const hasConfirmed = computed(() => currentPlayer.value?.hasConfirmed ?? false)

// Reset sélection locale quand le joueur affiché change
watch(() => props.playerId, () => {
  selectedColor.value = null
  selectedNumber.value = null
  jokerColor.value = null
  jokerCount.value = null
})

// Reset jokerColor quand on change de dé couleur
watch(selectedColor, () => { jokerColor.value = null })
// Reset jokerCount quand on change de dé nombre
watch(selectedNumber, () => { jokerCount.value = null })

// Ce joueur peut-il sélectionner des dés en ce moment ?
const canSelect = computed(() => {
  if (store.phase === 'turn_end') return false
  if (hasConfirmed.value) return false
  if (isActivePlayer.value && store.phase === 'active_selecting') return true
  // En passive_selecting : tous les joueurs peuvent choisir (y compris le joueur actif aux tours 1–3)
  if (store.phase === 'passive_selecting') return true
  return false
})

// Dés affichés selon le rôle du joueur
const colorDices = computed((): DiceColor[] => {
  if (!store.currentRoll) return []
  if (isActivePlayer.value || store.isFirstThreeTurns) {
    return store.currentRoll.colorDices
  }
  return store.availableForPassive.colorDices
})

const numberDices = computed((): DiceNumber[] => {
  if (!store.currentRoll) return []
  if (isActivePlayer.value || store.isFirstThreeTurns) {
    return store.currentRoll.numberDices
  }
  return store.availableForPassive.numberDices
})

const selectedColorIsJoker = computed(() =>
  selectedColor.value !== null && colorDices.value[selectedColor.value]?.value === 'joker'
)

const selectedNumberIsJoker = computed(() =>
  selectedNumber.value !== null && numberDices.value[selectedNumber.value]?.value === 'joker'
)

// Message d'attente affiché HORS du panneau
const waitingMessage = computed(() => {
  if (store.phase === 'waiting_roll' && !isActivePlayer.value && !store.isFirstThreeTurns)
    return `⏳ En attente du lancer de ${activePlayerName.value}...`
  if (store.phase === 'active_selecting' && !isActivePlayer.value)
    return `⏳ ${activePlayerName.value} choisit sa combinaison...`
  return ''
})

// Grise les dés non sélectionnés après confirmation
function dimmedColor(i: number): boolean {
  if (!hasConfirmed.value) return false
  return selectedColor.value !== i
}
function dimmedNumber(i: number): boolean {
  if (!hasConfirmed.value) return false
  return selectedNumber.value !== i
}

// La combo est prête à être confirmée (jokers résolus si nécessaire)
const comboIsReady = computed(() => {
  if (selectedColor.value === null || selectedNumber.value === null) return false
  if (selectedColorIsJoker.value && !jokerColor.value) return false
  if (selectedNumberIsJoker.value && !jokerCount.value) return false
  return true
})

async function handleRoll() {
  if (props.readonly) return
  isRolling.value = true
  selectedColor.value = null
  selectedNumber.value = null
  jokerColor.value = null
  jokerCount.value = null
  // Génère les valeurs et met à jour le store AVANT de lancer le spin
  const roll = rollAllDices()
  emit('roll', roll)
  // Attend que Vue rende les dés avec les nouvelles valeurs
  await nextTick()
  isSpinning.value = true
  isRolling.value = false
  setTimeout(() => { isSpinning.value = false }, 1600)
}

function selectColor(i: number) {
  if (props.readonly) return
  selectedColor.value = selectedColor.value === i ? null : i
}

function selectNumber(i: number) {
  if (props.readonly) return
  selectedNumber.value = selectedNumber.value === i ? null : i
}

async function confirmCombo() {
  if (props.readonly) return
  if (!comboIsReady.value || selectedColor.value === null || selectedNumber.value === null) return

  const jColor = selectedColorIsJoker.value ? jokerColor.value ?? undefined : undefined
  const jCount = selectedNumberIsJoker.value ? jokerCount.value ?? undefined : undefined

  // Tours 1–3 : le joueur actif passe aussi par confirm-passive (phase passive_selecting)
  if (isActivePlayer.value && !store.isFirstThreeTurns) {
    emit('confirm-active', selectedColor.value, selectedNumber.value, jColor, jCount)
  } else {
    emit('confirm-passive', props.playerId, selectedColor.value, selectedNumber.value, jColor, jCount)
  }

  emit('combo-confirmed', selectedColor.value, selectedNumber.value)
}

// handlePass gère tous les cas : volontaire, forcé (aucune case), après combo confirmée
function handlePass() {
  if (props.readonly) return
  // Tours 1–3 : le joueur actif passe aussi via pass-passive
  if (isActivePlayer.value && !currentPlayer.value?.hasConfirmed && !store.isFirstThreeTurns) {
    emit('pass-active')
  } else {
    emit('pass-passive', props.playerId)
  }
  emit('pass')
}
</script>

<style scoped>
/* ─── Message d'attente hors panneau ────────────────────────────────────────── */
.dice-wait-text {
  font-size: 12px;
  color: #6e6e88;
  text-align: center;
  padding: 0 0 8px;
  line-height: 1.4;
}

/* ─── Panneau principal ──────────────────────────────────────────────────────── */
.dices-panel {
  @apply w-full p-4 rounded-2xl flex flex-col gap-3;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
  min-height: 260px;
  position: relative;
  overflow: hidden;
  contain: layout;
}

.dices-panel--readonly {
  opacity: 0.65;
  pointer-events: none;
}

.dices-panel__intro {
  @apply flex flex-col items-center;
  flex: 1;
  justify-content: center;
}

.dices-panel__rolled {
  @apply flex flex-col gap-3;
  flex: 1;
}

/* ─── Actions (passer / confirmer) ──────────────────────────────────────────── */
.dices-actions {
  @apply flex items-center gap-3 flex-wrap mt-1;
}

.btn-pass {
  @apply text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all;
  background: transparent;
  color: #6e6e88;
  border: 1px solid #2e2e3e;
}

.btn-pass:hover {
  color: #e8e8f0;
  border-color: #6e6e88;
}

/* Roll button */
.btn-roll {
  @apply flex items-center gap-2 px-6 py-3 rounded-xl font-black text-base cursor-pointer transition-all;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  color: #0f0f13;
  border: none;
}

.btn-roll:hover {
  filter: brightness(1.1);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(245, 215, 66, 0.3);
}

.btn-roll--rolling {
  animation: shake 0.6s ease-in-out;
}

.btn-roll__icon { @apply text-xl; }

.btn-roll--rolling .btn-roll__icon {
  animation: spin 0.6s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-4px) rotate(-3deg); }
  40%       { transform: translateX(4px) rotate(3deg); }
  60%       { transform: translateX(-3px) rotate(-2deg); }
  80%       { transform: translateX(3px) rotate(2deg); }
}

@keyframes spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Badges */
.badge {
  @apply text-xs font-bold px-3 py-1 rounded-full;
}

.badge--special {
  background: rgba(245, 215, 66, 0.15);
  color: #f5d742;
  border: 1px solid rgba(245, 215, 66, 0.3);
}

.badge--active {
  background: rgba(92, 201, 110, 0.15);
  color: #5cc96e;
  border: 1px solid rgba(92, 201, 110, 0.3);
}

.badge--passive {
  background: rgba(91, 159, 245, 0.15);
  color: #5b9ff5;
  border: 1px solid rgba(91, 159, 245, 0.3);
}

.badge--done {
  background: rgba(92, 201, 110, 0.15);
  color: #5cc96e;
  border: 1px solid rgba(92, 201, 110, 0.3);
}

.badge--waiting {
  background: rgba(110, 110, 136, 0.15);
  color: #6e6e88;
  border: 1px solid rgba(110, 110, 136, 0.3);
}

/* ─── Rangées de dés ─────────────────────────────────────────────────────────── */
.dices-row {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  overflow: visible;
  height: 80px;
  align-items: center;
}

/* ─── Badge phase (bas-droite absolu) ───────────────────────────────────────── */
.dices-badge {
  position: absolute;
  bottom: 10px;
  right: 12px;
}

/* ─── Joker sidebar (vertical, à gauche des dés) ─────────────────────────────── */
.dices-main {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: flex-start;
}

.joker-sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 6px;
  border-radius: 12px;
  background: rgba(232, 232, 240, 0.05);
  border: 1px solid rgba(232, 232, 240, 0.1);
  flex-shrink: 0;
}

.joker-sidebar__section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.joker-sidebar__label {
  font-size: 9px;
  font-weight: 700;
  color: #6e6e88;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.joker-sidebar__colors {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.joker-sidebar__numbers {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: center;
}

.dices-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.joker-picker__color {
  @apply w-8 h-8 rounded-full cursor-pointer transition-all border-2;
  border-color: transparent;
}

.joker-picker__color:hover {
  transform: scale(1.15);
}

.joker-picker__color--selected {
  border-color: white;
  transform: scale(1.2);
  box-shadow: 0 0 8px rgba(255,255,255,0.4);
}

.joker-picker__number {
  @apply w-10 h-10 rounded-xl font-black text-base cursor-pointer transition-all;
  background: #23232f;
  border: 2px solid #3e3e52;
  color: #e8e8f0;
  font-family: 'Space Mono', monospace;
}

.joker-picker__number:hover {
  border-color: #f5d742;
  color: #f5d742;
}

.joker-picker__number--selected {
  background: #2a2a1a;
  border-color: #f5d742;
  color: #f5d742;
  box-shadow: 0 0 12px rgba(245, 215, 66, 0.3);
}

/* Joker resolved indicator */
.joker-resolved {
  @apply text-xs font-bold px-2 py-0.5 rounded-md;
  background: rgba(245, 215, 66, 0.15);
  color: #f5d742;
  border: 1px solid rgba(245, 215, 66, 0.3);
}

.btn-confirm {
  @apply px-4 py-2 rounded-xl font-black text-sm cursor-pointer transition-all ml-auto;
  background: #5cc96e;
  color: #0f0f13;
  border: none;
}

.btn-confirm:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

</style>