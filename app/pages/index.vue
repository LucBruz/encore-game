<template>
  <div class="page">
    <LoaderScreen v-if="showLoader" @done="showLoader = false" />
    <!-- Header -->
    <header class="page-header">
      <h1 class="page-title">ENCORE!</h1>
      <p class="page-subtitle">Jeu de société multijoueur en temps réel</p>
      <nav v-if="!lobby.gameId" class="page-nav">
        <NuxtLink to="/solo" class="nav-link nav-link--solo">Jouer contre un bot</NuxtLink>
        <NuxtLink to="/ia" class="nav-link">Benchmark des agents</NuxtLink>
      </nav>
    </header>

    <!-- Erreur globale -->
    <div v-if="lobby.error" class="error-banner">
      {{ lobby.error }}
    </div>

    <!-- ── SALLE D'ATTENTE ─────────────────────────────────────── -->
    <div v-if="lobby.gameId" class="lobby-card">

      <div class="lobby-code-header">
        <div>
          <p class="lobby-label">Code de la partie</p>
          <p class="lobby-code">{{ lobby.gameCode }}</p>
        </div>
        <button class="btn btn--ghost btn--sm" @click="copyCode">
          {{ copied ? '✓ Copié !' : 'Copier' }}
        </button>
      </div>

      <div class="lobby-players">
        <p class="lobby-label">Joueurs ({{ lobby.players.length }})</p>
        <div
          v-for="player in lobby.players"
          :key="player.playerId"
          class="lobby-player"
        >
          <span class="lobby-player__name">
            {{ player.playerName }}
            <span v-if="player.playerId === lobby.localPlayerId" class="lobby-player__you">(toi)</span>
            <span v-else-if="isBotId(player.playerId)" class="lobby-player__bot">bot</span>
          </span>
          <span class="lobby-player__right">
            <span
              class="lobby-player__status"
              :class="player.isReady ? 'lobby-player__status--ready' : 'lobby-player__status--waiting'"
            >
              {{ player.isReady ? '✓ Prêt' : 'En attente...' }}
            </span>
            <button
              v-if="lobby.isHost && isBotId(player.playerId)"
              class="lobby-player__remove"
              type="button"
              @click="lobby.removeBot(player.playerId)"
            >
              Retirer
            </button>
          </span>
        </div>
      </div>

      <!-- Ajout de bots : hote uniquement, avant le demarrage -->
      <div v-if="lobby.isHost && lobby.players.length < MAX_PLAYERS" class="lobby-bots">
        <p class="lobby-label">Ajouter un bot</p>
        <div class="duration-selector">
          <button
            v-for="id in DIFFICULTY_OPTIONS"
            :key="id"
            class="duration-btn"
            :class="{ 'duration-btn--selected': botDifficulty === id }"
            type="button"
            @click="botDifficulty = id"
          >
            {{ BOT_LABELS[id] }}
          </button>
        </div>
        <button class="btn btn--ghost btn--full btn--sm" type="button" @click="lobby.addBot(botDifficulty)">
          Ajouter ce bot
        </button>
        <p class="lobby-bots__hint">
          Un bot est prêt d'emblée. La partie démarre dès que tous les joueurs le sont.
        </p>
      </div>

      <div v-if="!lobby.localPlayer?.isReady">
        <button
          class="btn btn--primary btn--full"
          :disabled="lobby.status === 'loading'"
          @click="handleSetReady"
        >
          {{ lobby.status === 'loading' ? 'Chargement...' : 'Je suis prêt !' }}
        </button>
      </div>

      <p v-else class="lobby-waiting-msg">
        En attente des autres joueurs...
      </p>

    </div>

    <!-- ── FORMULAIRES ─────────────────────────────────────────── -->
    <div v-else class="forms-grid">

      <!-- Section A : Créer une partie -->
      <div class="form-card">
        <h2 class="form-title">Créer une partie</h2>

        <div class="form-group">
          <label class="form-label">Ton prénom</label>
          <input
            v-model="createName"
            class="form-input"
            type="text"
            placeholder="ex: Alice"
            maxlength="20"
            @keyup.enter="handleCreate"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Grille</label>

          <!-- Numéros de grilles -->
          <div class="grid-nums">
            <button
              v-for="grid in ALL_GRIDS"
              :key="grid.id"
              class="grid-num"
              :class="{ 'grid-num--selected': selectedGridId === grid.id }"
              :style="{ '--theme-color': GRID_THEMES[grid.id] }"
              type="button"
              @click="selectedGridId = grid.id"
            >
              {{ grid.id }}
            </button>
          </div>

          <!-- Aperçu de la grille sélectionnée -->
          <div v-if="selectedGrid" class="grid-preview">
            <div
              v-for="(cell, idx) in selectedGrid.cells"
              :key="idx"
              class="grid-preview__cell"
              :class="{ 'grid-preview__cell--star': cell[1] }"
              :style="{ background: selectedGrid.colorMap[cell[0]].hex }"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Temps par tour</label>
          <div class="duration-selector">
            <button
              v-for="d in DURATION_OPTIONS"
              :key="d"
              class="duration-btn"
              :class="{ 'duration-btn--selected': selectedDuration === d }"
              type="button"
              @click="selectedDuration = d"
            >
              {{ d }}s
            </button>
          </div>
        </div>

        <button
          class="btn btn--primary btn--full"
          :disabled="!createName.trim() || lobby.status === 'loading'"
          @click="handleCreate"
        >
          {{ lobby.status === 'loading' ? 'Création...' : 'Créer une partie →' }}
        </button>

        <div v-if="generatedCode" class="code-display">
          <p class="code-display__label">Partage ce code !</p>
          <p class="code-display__code">{{ generatedCode }}</p>
          <button class="btn btn--ghost btn--sm btn--full" @click="copyCode">
            {{ copied ? '✓ Copié !' : 'Copier le code' }}
          </button>
        </div>
      </div>

      <!-- Section B : Rejoindre une partie -->
      <div class="form-card">
        <h2 class="form-title">Rejoindre une partie</h2>

        <div class="form-group">
          <label class="form-label">Ton prénom</label>
          <input
            v-model="joinName"
            class="form-input"
            type="text"
            placeholder="ex: Bob"
            maxlength="20"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Code de la partie</label>
          <input
            v-model="joinCode"
            class="form-input form-input--code"
            type="text"
            placeholder="ex: XK92PL"
            maxlength="6"
            @input="joinCode = ($event.target as HTMLInputElement).value.toUpperCase()"
            @keyup.enter="handleJoin"
          />
        </div>

        <button
          class="btn btn--primary btn--full"
          :disabled="!joinName.trim() || joinCode.length !== 6 || lobby.status === 'loading'"
          @click="handleJoin"
        >
          {{ lobby.status === 'loading' ? 'Connexion...' : 'Rejoindre →' }}
        </button>
      </div>

    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import LoaderScreen from '~/components/animations/LoaderScreen.vue'
import { useLobbyStore } from '~/stores/lobbyStore'
import { ALL_GRIDS, GRID_MAP } from '~/data/grids/index'
import type { GridId } from '~/data/grids/index'
import { BOT_LABELS, isBotId } from '~/utils/botIdentity'
import type { DifficultyId } from '~/composables/useBotPlayer'

const GRID_THEMES: Record<string, string> = {
  '01': '#c0392b',
  '02': '#e67e22',
  '03': '#8e44ad',
  '04': '#d4a017',
  '05': '#2980b9',
  '06': '#27ae60',
  '07': '#d35400',
  '08': '#c2185b',
}

const lobby = useLobbyStore()

const DURATION_OPTIONS = [15, 30, 60, 90, 120] as const

// Valeur par defaut de `games.max_players`. Le controle qui fait foi est fait
// cote serveur dans `addBot` ; celui-ci ne sert qu'a masquer le formulaire.
const MAX_PLAYERS = 6
const DIFFICULTY_OPTIONS = Object.keys(BOT_LABELS) as DifficultyId[]
const botDifficulty = ref<DifficultyId>('medium')

const showLoader = ref(true)
const createName = ref('')
const selectedGridId = ref('01')
const selectedGrid = computed(() => GRID_MAP[selectedGridId.value as GridId])
const selectedDuration = ref(60)
const generatedCode = ref('')
const joinName = ref('')
const joinCode = ref('')
const copied = ref(false)

function copyCode() {
  const code = lobby.gameCode ?? generatedCode.value
  if (!code) return
  navigator.clipboard.writeText(code)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

async function handleCreate() {
  if (!createName.value.trim()) return
  try {
    const code = await lobby.createGame(createName.value.trim(), selectedGridId.value, selectedDuration.value)
    generatedCode.value = code
  } catch {
    // L'erreur est déjà dans lobby.error
  }
}

async function handleJoin() {
  if (!joinName.value.trim() || joinCode.value.length !== 6) return
  try {
    await lobby.joinGame(joinCode.value, joinName.value.trim())
  } catch {
    // L'erreur est déjà dans lobby.error
  }
}

async function handleSetReady() {
  try {
    await lobby.setReady()
  } catch {
    // L'erreur est déjà dans lobby.error
  }
}

onMounted(() => {
  lobby.init()
})
</script>

<style scoped>
.page {
  @apply min-h-screen flex flex-col items-center gap-8 py-12 px-4;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

.page-header { @apply text-center; }

.page-title {
  @apply text-5xl font-black tracking-tight;
  font-family: 'Space Mono', monospace;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.page-subtitle {
  @apply text-sm mt-2;
  color: #8f8fa3;
}

.page-nav {
  @apply flex items-center justify-center gap-3 mt-4 flex-wrap;
}

.nav-link {
  @apply px-3 py-1.5 rounded-lg text-xs font-bold transition-all;
  background: #17171f;
  border: 1px solid #2e2e3e;
  color: #a0a0b8;
}

.nav-link:hover {
  border-color: #5b9ff5;
  color: #e8e8f0;
}

.nav-link--solo:hover {
  border-color: #5cc96e;
}

.error-banner {
  @apply w-full max-w-md px-4 py-3 rounded-xl text-sm font-bold;
  background: #2d1a1a;
  border: 1px solid #e85a82;
  color: #e85a82;
}

.forms-grid {
  @apply w-full max-w-2xl grid gap-4;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.form-card {
  @apply flex flex-col gap-4 p-6 rounded-2xl;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.form-title {
  @apply text-lg font-black;
  color: #f5d742;
}

.form-group { @apply flex flex-col gap-1.5; }

.form-label {
  @apply text-xs font-bold uppercase tracking-wider;
  color: #8f8fa3;
}

.form-input {
  @apply w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all;
  background: #23232f;
  border: 1px solid #2e2e3e;
  color: #e8e8f0;
}

.form-input:focus { border-color: #f5d742; }
.form-input::placeholder { color: #3e3e52; }

.form-input--code {
  @apply text-center font-black text-lg uppercase;
  font-family: 'Space Mono', monospace;
  letter-spacing: 0.3em;
}

.code-display {
  @apply flex flex-col items-center gap-2 p-4 rounded-xl;
  background: #23232f;
  border: 1px solid #2e2e3e;
}

.code-display__label {
  @apply text-xs font-bold uppercase tracking-wider;
  color: #8f8fa3;
}

.code-display__code {
  @apply text-3xl font-black;
  font-family: 'Space Mono', monospace;
  color: #f5d742;
  letter-spacing: 0.3em;
}

.lobby-card {
  @apply w-full max-w-md flex flex-col gap-5 p-6 rounded-2xl;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.lobby-code-header {
  @apply flex items-center justify-between pb-4;
  border-bottom: 1px solid #2e2e3e;
}

.lobby-label {
  @apply text-xs font-bold uppercase tracking-wider mb-1;
  color: #8f8fa3;
}

.lobby-code {
  @apply text-2xl font-black;
  font-family: 'Space Mono', monospace;
  color: #f5d742;
  letter-spacing: 0.2em;
}

.lobby-players { @apply flex flex-col gap-2; }

.lobby-player {
  @apply flex items-center justify-between px-3 py-2 rounded-xl;
  background: #23232f;
  border: 1px solid #2e2e3e;
}

.lobby-player__name {
  @apply text-sm font-bold;
  color: #e8e8f0;
}

.lobby-player__you {
  @apply text-xs font-normal ml-1;
  color: #8f8fa3;
}

.lobby-player__bot {
  @apply text-xs font-bold uppercase tracking-wider ml-2 px-1.5 py-0.5 rounded-full;
  background: rgba(91, 159, 245, 0.15);
  color: #5b9ff5;
}

.lobby-player__right { @apply flex items-center gap-2; }

.lobby-player__remove {
  @apply text-xs font-bold px-2 py-0.5 rounded-full cursor-pointer transition-all;
  background: transparent;
  border: 1px solid #3e3e52;
  color: #8f8fa3;
}

.lobby-player__remove:hover {
  border-color: #e85a82;
  color: #e85a82;
}

.lobby-bots {
  @apply flex flex-col gap-2 pt-3;
  border-top: 1px solid #2e2e3e;
}

.lobby-bots__hint {
  @apply text-xs leading-relaxed;
  color: #8f8fa3;
}

.lobby-player__status {
  @apply text-xs font-bold px-2 py-0.5 rounded-full;
}

.lobby-player__status--ready {
  background: #1a2e1a;
  color: #5cc96e;
  border: 1px solid #5cc96e;
}

.lobby-player__status--waiting {
  background: #23232f;
  color: #8f8fa3;
  border: 1px solid #3e3e52;
}

.lobby-waiting-msg {
  @apply text-sm text-center py-2;
  color: #8f8fa3;
}

.btn {
  @apply px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all;
  border: none;
}

.btn--primary {
  background: linear-gradient(135deg, #f5d742, #f58a35);
  color: #0f0f13;
}

.btn--primary:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.btn--primary:disabled { @apply opacity-40 cursor-not-allowed; }

.btn--ghost {
  background: #23232f;
  color: #8f8fa3;
  border: 1px solid #2e2e3e;
}

.btn--ghost:hover { color: #e8e8f0; }
.btn--sm { @apply px-3 py-1.5 text-xs; }
.btn--full { @apply w-full text-center; }

/* ── Duration selector ───────────────────────────────────────────────────── */

.duration-selector {
  @apply flex gap-1.5;
}

.duration-btn {
  @apply flex-1 py-2 rounded-lg text-sm font-black cursor-pointer transition-all;
  font-family: 'Space Mono', monospace;
  background: #23232f;
  border: 2px solid #2e2e3e;
  color: #8f8fa3;
}

.duration-btn:hover { border-color: #6e6e88; color: #e8e8f0; }

.duration-btn--selected {
  border-color: #f5d742;
  background: rgba(245, 215, 66, 0.1);
  color: #f5d742;
}

/* ── Grid selector ───────────────────────────────────────────────────────── */

.grid-nums {
  @apply flex gap-1.5 flex-wrap;
}

.grid-num {
  @apply px-3 py-1.5 rounded-lg text-sm font-black cursor-pointer transition-all;
  font-family: 'Space Mono', monospace;
  background: color-mix(in srgb, var(--theme-color) 20%, transparent);
  border: 2px solid color-mix(in srgb, var(--theme-color) 40%, transparent);
  color: color-mix(in srgb, var(--theme-color) 80%, #e8e8f0);
}

.grid-num:hover {
  border-color: var(--theme-color);
  background: color-mix(in srgb, var(--theme-color) 30%, transparent);
}

.grid-num--selected {
  border-color: var(--theme-color);
  background: color-mix(in srgb, var(--theme-color) 35%, transparent);
  color: #ffffff;
  box-shadow: 0 0 8px color-mix(in srgb, var(--theme-color) 50%, transparent);
}

/* ── Grid preview ────────────────────────────────────────────────────────── */

.grid-preview {
  @apply mt-2 rounded-xl overflow-hidden;
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 2px;
  padding: 8px;
  background: #12121a;
  border: 1px solid #2e2e3e;
}

.grid-preview__cell {
  aspect-ratio: 1;
  border-radius: 3px;
  position: relative;
}

.grid-preview__cell--star::after {
  content: '★';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: white;
  text-shadow: 0 0 3px rgba(0,0,0,0.8);
  line-height: 1;
  display: grid;
  place-items: center;
}
</style>