<template>
  <div class="game-grid" :class="{ 'game-grid--readonly': readonly }">

    <!-- En-tête colonnes -->
    <div class="grid-header">
      <div
        v-for="(col, i) in COLS"
        :key="col"
        class="col-label"
        :class="{ 'col-label--start': i === 7 }"
      >
        {{ col }}
      </div>
    </div>

    <!-- Grille -->
    <div class="grid-cells">
      <GameCell
        v-for="([colorKey, hasStar], idx) in grid.cells"
        :key="idx"
        :color="COLOR_MAP[colorKey].name"
        :star="hasStar"
        :checked="checkedCells.has(idx)"
        :pending="pendingCells.includes(idx)"
        :is-valid="validCells.has(idx)"
        :is-blocked="isBlockedMode && !validCells.has(idx) && !checkedCells.has(idx) && !pendingCells.includes(idx)"
        :rejected="rejectedCell === idx"
        :is-start-col="idx % 15 === 7"
        @click="handleCellClick(idx)"
      />
    </div>

    <!-- Points colonnes -->
    <div class="grid-footer">
      <div class="points-row">
        <div
          v-for="(col, i) in COLS"
          :key="`f-${col}`"
          class="points-cell"
          :class="{
            'points-cell--start': i === 7,
            'points-cell--won-first': columnBonus[col] === 'first',
            'points-cell--taken': columnBonus[col] === 'others' || (columnBonus[col] === null && columnsTaken?.has(col))
          }"
        >
          {{ COLUMN_POINTS[col].first }}
        </div>
      </div>
      <div class="points-row">
        <div
          v-for="(col, i) in COLS"
          :key="`o-${col}`"
          class="points-cell points-cell--others"
          :class="{
            'points-cell--start': i === 7,
            'points-cell--won-second': columnBonus[col] === 'others'
          }"
        >
          {{ COLUMN_POINTS[col].others }}
        </div>
      </div>
    </div>

    <!-- Message d'erreur placement — s'efface seul, pour ne pas rester en travers de
         l'écran une fois que le joueur est reparti sur autre chose. -->
    <Transition name="err">
      <div v-if="visibleError" class="placement-error">
        {{ visibleError }}
      </div>
    </Transition>

    <!-- Sélection commencée dont aucune suite n'est jouable : le joueur reste coincé
         tant qu'il n'annule pas, donc le bouton vient à lui. -->
    <div v-if="isStuck" class="placement-stuck">
      <span class="placement-stuck__text">Aucune suite possible à partir de ces cases.</span>
      <button class="btn-restart-placement" :disabled="readonly" @click="$emit('cancel-placement')">
        ↺ Recommencer la sélection
      </button>
    </div>

    <!-- Bouton confirmer placement -->
    <div v-if="pendingCells.length > 0 && confirmedCombo" class="placement-confirm">
      <span class="placement-confirm__count">
        {{ pendingCells.length }} / {{ confirmedCombo.count }} case(s) sélectionnée(s)
      </span>
      <button
        class="btn-confirm-placement"
        :disabled="pendingCells.length !== confirmedCombo.count || readonly"
        @click="$emit('confirm-placement')"
      >
        ✓ Valider le placement
      </button>
      <button class="btn-cancel-placement" :disabled="readonly" @click="$emit('cancel-placement')">
        ✕ Annuler
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { COLS, COLUMN_POINTS, COLOR_MAP } from '~/data/grids/grid-01'
import type { ColorKey } from '~/data/grids/grid-01'
import type { PlayerState } from '~/stores/gameStore'

const props = defineProps<{
  grid: typeof import('~/data/grids/grid-01').GRID_01
  checkedCells: Set<number>
  pendingCells: number[]
  validCells: Set<number>
  columnBonus: PlayerState['columnBonus']
  columnsTaken?: Set<string>
  confirmedCombo: { color: string; count: number } | null
  placementError: string | null
  isBlockedMode: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  'cell-click': [idx: number]
  'confirm-placement': []
  'cancel-placement': []
}>()

const rejectedCell = ref<number | null>(null)
const visibleError = ref<string | null>(null)
let rejectTimer: ReturnType<typeof setTimeout> | null = null
let errorTimer: ReturnType<typeof setTimeout> | null = null

function showError(message: string) {
  visibleError.value = message
  if (errorTimer) clearTimeout(errorTimer)
  errorTimer = setTimeout(() => { visibleError.value = null }, 3500)
}

// Les erreurs venues du store (placement invalide, jokers épuisés) passent par le même
// bandeau que les refus locaux, sinon deux messages se disputent la même place.
watch(() => props.placementError, (err) => { if (err) showError(err) })

onBeforeUnmount(() => {
  if (rejectTimer) clearTimeout(rejectTimer)
  if (errorTimer) clearTimeout(errorTimer)
})

const isStuck = computed(() =>
  !!props.confirmedCombo
  && props.pendingCells.length > 0
  && props.pendingCells.length < props.confirmedCombo.count
  && props.validCells.size === 0
)

/** null si la case est jouable, sinon la raison à montrer au joueur. */
function rejectionReason(idx: number): string | null {
  if (!props.confirmedCombo) return "Choisis d'abord ta combinaison de dés"
  if (props.checkedCells.has(idx)) return 'Cette case est déjà cochée'
  if (props.validCells.has(idx)) return null

  const combo = props.confirmedCombo
  const cellColor = props.grid.cells[idx]?.[0]
  if (cellColor && cellColor !== combo.color) {
    const label = COLOR_MAP[combo.color as ColorKey]?.label?.toLowerCase() ?? combo.color
    return `Mauvaise couleur — il te faut du ${label}`
  }
  if (props.pendingCells.length >= combo.count) {
    return `Tu ne peux cocher que ${combo.count} case(s) ce tour-ci`
  }
  if (props.pendingCells.length > 0) {
    return 'Pas reliée aux cases que tu viens de choisir'
  }
  if (props.checkedCells.size === 0) {
    return 'Ton premier coup doit partir de la colonne H'
  }
  return 'Elle doit toucher une de tes cases déjà cochées'
}

function handleCellClick(idx: number) {
  if (props.readonly) return

  // Désélection d'une case provisoire : toujours autorisée.
  if (props.pendingCells.includes(idx)) {
    emit('cell-click', idx)
    return
  }

  const reason = rejectionReason(idx)
  if (reason) {
    // Un clic refusé ne disparaît plus dans le vide : secousse sur la case + raison.
    rejectedCell.value = idx
    if (rejectTimer) clearTimeout(rejectTimer)
    rejectTimer = setTimeout(() => { rejectedCell.value = null }, 400)
    showError(reason)
    return
  }

  emit('cell-click', idx)
}
</script>

<style scoped>
.game-grid {
  @apply w-full flex flex-col gap-2;
  /* La grille prend la largeur disponible, bornée par la hauteur restante pour qu'elle
     tienne toujours à l'écran sans scroll (7 rangées de cases carrées). */
  max-width: min(100%, calc((100vh - 15rem) / 7 * 15));
}

.game-grid--readonly :deep(.game-cell) {
  cursor: default !important;
  pointer-events: none;
}

.grid-header {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 3px;
  @apply mb-1;
}

.col-label {
  @apply text-center text-xs font-bold py-1 rounded;
  font-family: 'Space Mono', monospace;
  color: #8f8fa3;
}

.col-label--start {
  color: #f5d742;
  background: rgba(245, 215, 66, 0.1);
}

.grid-cells {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 3px;
}

.grid-footer {
  @apply mt-1;
  /* padding-left uniquement pour que le shadow de la col A ne soit pas rogné.
     Pas de padding-bottom nécessaire : overflow:visible laisse le shadow sortir dans le gap. */
  padding-left: 5px;
  overflow: visible;
}

.points-row {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 5px;
  margin-bottom: 5px;
}

.points-cell {
  @apply text-center text-xs font-bold;
  /* 4px vertical + 3px horizontal — les 4 côtés du box-shadow (2px) restent visibles */
  padding: 4px 3px;
  font-family: 'Space Mono', monospace;
  color: #e8e8f0;
}

.points-cell--others { color: #8f8fa3; }
.points-cell--start { color: #f5d742; }

/* Colonne prise par un autre (première ligne — points inaccessibles) */
.points-cell--taken {
  position: relative;
  color: #e85a82;
  box-shadow: 0 0 0 2px #e85a82;
  border-radius: 3px;
  opacity: 0.65;
  animation: cell-circle-red 0.35s ease-out;
}
@keyframes cell-circle-red {
  from { box-shadow: 0 0 0 0px #e85a82; opacity: 0.3; }
  to   { box-shadow: 0 0 0 2px #e85a82; opacity: 0.65; }
}
.points-cell--taken::before,
.points-cell--taken::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 14px;
  height: 1.5px;
  background: #e85a82;
  pointer-events: none;
}
.points-cell--taken::before {
  animation: grid-cross-bar-1 0.2s ease-out 0.15s both;
}
.points-cell--taken::after {
  animation: grid-cross-bar-2 0.2s ease-out 0.25s both;
}
@keyframes grid-cross-bar-1 {
  from { transform: translate(-50%, -50%) rotate(45deg) scaleX(0); }
  to   { transform: translate(-50%, -50%) rotate(45deg) scaleX(1); }
}
@keyframes grid-cross-bar-2 {
  from { transform: translate(-50%, -50%) rotate(-45deg) scaleX(0); }
  to   { transform: translate(-50%, -50%) rotate(-45deg) scaleX(1); }
}

/* Joueur a fini la colonne en second — deuxième ligne entourée en vert */
.points-cell--won-first {
  position: relative;
  box-shadow: 0 0 0 2px #5cc96e;
  border-radius: 3px;
  color: #5cc96e;
  animation: cell-circled 0.35s ease-out;
}
@keyframes cell-circled {
  from { box-shadow: 0 0 0 0px #5cc96e; opacity: 0.4; }
  to   { box-shadow: 0 0 0 2px #5cc96e; opacity: 1; }
}

.points-cell--won-second {
  box-shadow: 0 0 0 2px #5cc96e;
  border-radius: 3px;
  color: #5cc96e;
  animation: cell-circled 0.35s ease-out;
}

.placement-error {
  @apply text-sm font-bold px-4 py-2.5 rounded-lg;
  background: rgba(232, 90, 130, 0.18);
  color: #ff8fab;
  border: 1px solid rgba(232, 90, 130, 0.5);
}

.err-enter-active, .err-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.err-enter-from, .err-leave-to { opacity: 0; transform: translateY(-4px); }

.placement-stuck {
  @apply flex items-center gap-3 flex-wrap px-3 py-2 rounded-xl;
  background: rgba(245, 138, 53, 0.12);
  border: 1px solid rgba(245, 138, 53, 0.45);
}

.placement-stuck__text {
  @apply text-xs font-bold;
  color: #f5a35a;
}

.btn-restart-placement {
  @apply px-3 py-1.5 rounded-lg font-black text-xs cursor-pointer transition-all;
  background: #f58a35;
  color: #0f0f13;
  border: none;
}

.btn-restart-placement:hover:not(:disabled) { filter: brightness(1.1); }
.btn-restart-placement:disabled { @apply opacity-40 cursor-not-allowed; }

.placement-confirm {
  @apply flex items-center gap-3 flex-wrap px-3 py-2 rounded-xl;
  background: #23232f;
  border: 1px solid #3e3e52;
}

.placement-confirm__count {
  @apply text-xs font-bold;
  color: #8f8fa3;
}

.btn-confirm-placement {
  @apply px-4 py-1.5 rounded-lg font-black text-sm cursor-pointer transition-all;
  background: #5cc96e;
  color: #0f0f13;
  border: none;
}

.btn-confirm-placement:hover:not(:disabled) { filter: brightness(1.1); }
.btn-confirm-placement:disabled { @apply opacity-40 cursor-not-allowed; }

.btn-cancel-placement {
  @apply px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all;
  background: transparent;
  color: #8f8fa3;
  border: 1px solid #2e2e3e;
}

.btn-cancel-placement:hover {
  color: #e85a82;
  border-color: #e85a82;
}
</style>
