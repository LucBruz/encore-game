<template>
  <div class="dices-panel" :class="{ 'dices-panel--readonly': readonly }">

    <!-- État : pas encore lancé -->
    <div v-if="store.phase === 'waiting_roll'" class="dices-panel__intro">
      <button
        v-if="isActivePlayer"
        class="btn-roll"
        :class="{ 'btn-roll--rolling': isRolling }"
        :disabled="readonly"
        @click="handleRoll"
      >
        <span class="btn-roll__icon">🎲</span>
        <span>Lancer les dés</span>
      </button>
      <p v-else class="dices-panel__waiting">
        En attente du lancer de <strong>{{ activePlayerName }}</strong>...
      </p>
    </div>

    <!-- État : dés lancés -->
    <div v-else class="dices-panel__rolled">

      <!-- Label phase -->
      <div class="dices-panel__label">
        <span v-if="store.phase === 'turn_end'" class="badge badge--done">
          ✓ Tout le monde a joué — prêt pour le tour suivant
        </span>
        <span v-else-if="store.isFirstThreeTurns" class="badge badge--special">
          ⚡ Tours 1–3 · Tous les dés disponibles
        </span>
        <span v-else-if="isActivePlayer && store.phase === 'active_selecting'" class="badge badge--active">
          🎲 Tu es le joueur actif · Choisis ta combinaison en premier
        </span>
        <span v-else-if="!isActivePlayer && store.phase === 'passive_selecting'" class="badge badge--passive">
          Choisis parmi les {{ store.isFirstThreeTurns ? '6' : '4' }} dés restants
        </span>
        <span v-else-if="isActivePlayer && store.phase === 'passive_selecting' && hasConfirmed" class="badge badge--done">
          ✓ Tu as confirmé · En attente des autres joueurs...
        </span>
        <span v-else-if="!isActivePlayer && store.phase === 'active_selecting'" class="badge badge--waiting">
          ⏳ En attente du choix de <strong>{{ activePlayerName }}</strong>...
        </span>
      </div>

      <!-- Dés (visibles uniquement si c'est le bon moment pour ce joueur) -->
      <template v-if="canSelect">

        <!-- Dés couleur -->
        <div class="dices-group">
          <span class="dices-group__label">Couleur</span>
          <div class="dices-row">
            <GameDice
              v-for="(dice, i) in colorDices"
              :key="`c-${i}`"
              type="color"
              :value="dice.value"
              :selected="selectedColor === i"
              :selectable="true"
              @select="selectColor(i)"
            />
          </div>
        </div>

        <!-- Sélecteur joker couleur -->
        <div v-if="selectedColorIsJoker" class="joker-picker">
          <span class="joker-picker__label">Choisis la couleur du joker :</span>
          <div class="joker-picker__options">
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

        <!-- Dés chiffre -->
        <div class="dices-group">
          <span class="dices-group__label">Chiffre</span>
          <div class="dices-row">
            <GameDice
              v-for="(dice, i) in numberDices"
              :key="`n-${i}`"
              type="number"
              :value="dice.value"
              :selected="selectedNumber === i"
              :selectable="true"
              @select="selectNumber(i)"
            />
          </div>
        </div>

        <!-- Sélecteur joker nombre -->
        <div v-if="selectedNumberIsJoker" class="joker-picker">
          <span class="joker-picker__label">Choisis la valeur du joker :</span>
          <div class="joker-picker__options">
            <button
              v-for="n in [1, 2, 3, 4, 5]"
              :key="n"
              class="joker-picker__number"
              :class="{ 'joker-picker__number--selected': jokerCount === n }"
              @click="jokerCount = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <!-- Combinaison choisie - pas encore confirmée -->
        <div v-if="selectedColor !== null && selectedNumber !== null && comboIsReady" class="dices-combo">
          <span class="dices-combo__label">Ta combinaison :</span>
          <div class="dices-combo__dice">
            <GameDice
              type="color"
              :value="colorDices[selectedColor].value"
              :selectable="false"
            />
            <span class="dices-combo__plus">+</span>
            <GameDice
              type="number"
              :value="numberDices[selectedNumber].value"
              :selectable="false"
            />
            <span v-if="selectedColorIsJoker && jokerColor" class="joker-resolved">→ {{ jokerColor.toUpperCase() }}</span>
            <span v-if="selectedNumberIsJoker && jokerCount" class="joker-resolved">→ {{ jokerCount }}</span>
          </div>
          <button class="btn-confirm" @click="confirmCombo">
            ✓ Confirmer
          </button>
        </div>

        <!-- Passer son tour (volontaire) -->
        <button class="btn-pass" :disabled="readonly" @click="handlePass">
          Passer mon tour
        </button>

      </template>

      <!-- Combo confirmée : feedback + rappel de placer sur la grille -->
      <div v-else-if="hasConfirmed && currentPlayer?.confirmedCombo" class="dices-combo dices-combo--confirmed">
        <span class="dices-combo__label">✓ Combinaison confirmée</span>
        <div class="dices-combo__dice">
          <span class="dices-combo__color-badge" :data-color="currentPlayer.confirmedCombo.color">
            {{ currentPlayer.confirmedCombo.color.toUpperCase() }}
          </span>
          <span class="dices-combo__plus">×</span>
          <span class="dices-combo__count">{{ currentPlayer.confirmedCombo.count }}</span>
        </div>
        <p v-if="!currentPlayer.hasPlaced" class="dices-combo__hint">
          👆 Clique {{ currentPlayer.confirmedCombo.count }} case(s) sur la grille
        </p>
        <p v-else class="dices-combo__hint dices-combo__hint--done">
          ✓ Cases placées · En attente des autres joueurs...
        </p>
        <button v-if="!currentPlayer.hasPlaced" class="btn-pass" :disabled="readonly" @click="handlePass">
          Passer mon tour
        </button>
      </div>

      <!-- Joueur passif en attente de l'actif -->
      <div v-else-if="!isActivePlayer && store.phase === 'active_selecting'" class="dices-panel__waiting-active">
        <p>⏳ En attente que <strong>{{ activePlayerName }}</strong> choisisse ses dés...</p>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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
  if (!isActivePlayer.value && store.phase === 'passive_selecting') return true
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
  await new Promise(r => setTimeout(r, 600))
  const roll = rollAllDices()
  emit('roll', roll)
  isRolling.value = false
  selectedColor.value = null
  selectedNumber.value = null
  jokerColor.value = null
  jokerCount.value = null
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

  if (isActivePlayer.value) {
    emit('confirm-active', selectedColor.value, selectedNumber.value, jColor, jCount)
  } else {
    emit('confirm-passive', props.playerId, selectedColor.value, selectedNumber.value, jColor, jCount)
  }

  emit('combo-confirmed', selectedColor.value, selectedNumber.value)
}

// handlePass gère tous les cas : volontaire, forcé (aucune case), après combo confirmée
function handlePass() {
  if (props.readonly) return
  if (isActivePlayer.value && !currentPlayer.value?.hasConfirmed) {
    emit('pass-active')
  } else {
    emit('pass-passive', props.playerId)
  }
  emit('pass')
}
</script>

<style scoped>
.dices-panel {
  @apply w-full p-4 rounded-2xl flex flex-col gap-4;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.dices-panel--readonly {
  opacity: 0.65;
  pointer-events: none;
}

.dices-panel__intro {
  @apply flex flex-col items-center gap-3 py-4;
}

.dices-panel__waiting {
  @apply text-sm text-center;
  color: #6e6e88;
}

.dices-panel__waiting-active {
  @apply text-sm text-center py-4;
  color: #6e6e88;
}

.btn-pass {
  @apply text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all self-start;
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

/* Dices groups */
.dices-group {
  @apply flex flex-col gap-2;
}

.dices-group__label {
  @apply text-xs font-bold uppercase tracking-widest;
  color: #6e6e88;
}

.dices-row {
  @apply flex gap-2 flex-wrap;
}

/* Joker picker */
.joker-picker {
  @apply flex flex-col gap-2 p-3 rounded-xl;
  background: rgba(232, 232, 240, 0.05);
  border: 1px solid rgba(232, 232, 240, 0.1);
}

.joker-picker__label {
  @apply text-xs font-bold;
  color: #6e6e88;
}

.joker-picker__options {
  @apply flex gap-2 flex-wrap;
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

/* Combo */
.dices-combo {
  @apply flex items-center gap-3 flex-wrap p-3 rounded-xl;
  background: #23232f;
  border: 1px solid #3e3e52;
}

.dices-combo--confirmed {
  border-color: #5cc96e;
  background: rgba(92, 201, 110, 0.05);
}

.dices-combo__label {
  @apply text-xs font-bold;
  color: #6e6e88;
}

.dices-combo__dice {
  @apply flex items-center gap-2;
}

.dices-combo__plus {
  @apply font-black text-lg;
  color: #6e6e88;
}

.dices-combo__count {
  @apply font-black text-lg;
  color: #e8e8f0;
}

.dices-combo__color-badge {
  @apply text-xs font-black px-2 py-1 rounded-md;
  background: #2e2e3e;
  color: #e8e8f0;
}

.dices-combo__hint {
  @apply w-full text-xs mt-1;
  color: #5b9ff5;
}

.dices-combo__hint--done {
  color: #5cc96e;
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