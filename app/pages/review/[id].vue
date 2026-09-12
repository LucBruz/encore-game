<template>
  <div class="page">
    <header class="rv-header">
      <NuxtLink to="/" class="back">← Retour</NuxtLink>
      <h1 class="rv-title">Analyse de la partie</h1>
      <p class="lede">
        Le moteur est mis à votre place, avec vos seules informations : votre feuille,
        celles des adversaires — publiques dans la règle — et le lancer du tour. Les dés
        à venir sont tirés au hasard, jamais ceux que vous avez réellement eus.
      </p>
    </header>

    <div v-if="error" class="card card--error">{{ error }}</div>

    <!-- Choix du joueur puis lancement -->
    <div v-if="phase === 'idle'" class="card">
      <p class="label">Quel joueur analyser ?</p>
      <div class="chips">
        <button
          v-for="p in players"
          :key="p.id"
          class="chip"
          :class="{ 'chip--on': target === p.id }"
          type="button"
          @click="target = p.id"
        >
          {{ p.name }}
        </button>
      </div>
      <p class="meta">
        {{ decisionCount }} décisions à analyser, environ {{ etaLabel }}.
        L'analyse déroule des centaines de parties par coup ; la page reste affichée mais
        ne répond pas pendant ce temps.
      </p>
      <button class="btn" type="button" :disabled="!target" @click="run">
        Lancer l'analyse
      </button>
    </div>

    <!-- Progression -->
    <div v-else-if="phase === 'running'" class="card">
      <p class="label">Analyse en cours</p>
      <div class="bar"><div class="bar__fill" :style="{ width: `${pct}%` }" /></div>
      <p class="meta">{{ done }} / {{ total }} décisions — {{ remainingLabel }}</p>
    </div>

    <!-- Résultat -->
    <template v-else-if="review">
      <div class="card">
        <p class="label">{{ review.playerName }}</p>
        <div class="stats">
          <div class="stat">
            <span class="stat__v">{{ review.summary.decisions }}</span>
            <span class="stat__k">décisions</span>
          </div>
          <div class="stat">
            <span class="stat__v stat__v--good">{{ review.summary.good }}</span>
            <span class="stat__k">coups défendables</span>
          </div>
          <div class="stat">
            <span class="stat__v stat__v--warn">{{ review.summary.erreurs }}</span>
            <span class="stat__k">erreurs</span>
          </div>
          <div class="stat">
            <span class="stat__v stat__v--bad">{{ review.summary.fautes }}</span>
            <span class="stat__k">fautes</span>
          </div>
        </div>
        <p class="meta">
          L'outil ne reproche un coup que si l'écart au meilleur dépasse
          {{ BANDS.accuse }} points <em>et</em> sort du bruit de mesure. En dessous, il se
          tait : plusieurs coups sont presque toujours également défendables, et lui en
          reprocher un serait faux. Il laisse donc passer environ la moitié des coups
          discutables — c'est le sens dans lequel on préfère se tromper.
        </p>
      </div>

      <div class="card">
        <p class="label">Coup par coup</p>
        <div class="moves">
          <button
            v-for="(m, i) in review.moves"
            :key="i"
            class="move"
            :class="[`move--${m.verdict}`, { 'move--on': selected === i }]"
            type="button"
            @click="selected = selected === i ? null : i"
          >
            <span class="move__turn">T{{ m.turn + 1 }}</span>
            <span class="move__verdict">{{ VERDICT_LABEL[m.verdict] }}</span>
            <span v-if="m.verdict === 'erreur' || m.verdict === 'faute'" class="move__loss">
              −{{ m.loss.toFixed(1) }}
            </span>
            <span v-else class="move__loss move__loss--none">—</span>
          </button>
        </div>
      </div>

      <div v-if="current" class="card">
        <p class="label">Tour {{ current.turn + 1 }} — {{ VERDICT_LABEL[current.verdict] }}</p>
        <p class="meta">
          {{ current.legalMoves - 1 }} coups possibles, dont
          <strong>{{ current.goodMoves.length }}</strong> que l'analyse ne sait pas
          départager. Votre coup
          {{ current.playedWasGood ? 'en faisait partie' : "n'en faisait pas partie" }}.
          <template v-if="current.verdict === 'erreur' || current.verdict === 'faute'">
            Écart estimé : {{ current.loss.toFixed(2) }} ± {{ current.loss95.toFixed(2) }} points.
          </template>
        </p>
        <div class="grid-wrap">
          <div class="mini">
            <span
              v-for="(cell, idx) in gridCells"
              :key="idx"
              class="mini__cell"
              :class="{
                'mini__cell--played': playedCells.has(idx),
                'mini__cell--suggested': suggestedCells.has(idx),
              }"
              :style="{ background: COLOR_MAP[cell[0]]?.hex }"
            />
          </div>
          <div class="legend">
            <span class="legend__item"><i class="swatch swatch--played" /> votre coup</span>
            <span v-if="!current.playedWasGood" class="legend__item">
              <i class="swatch swatch--suggested" /> une alternative défendable
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useGameStore } from '~/stores/gameStore'
import { useLobbyStore } from '~/stores/lobbyStore'
import { COLOR_MAP } from '~/data/grids/grid-01'
import { V3_WEIGHTS } from '~/composables/useBotPlayer'
import { makeGreedyV3Bot } from '~~/bots/heuristicV3'
import { reviewGameAsync } from '~~/analysis/game'
import { replayDecisions } from '~~/analysis/replay'
import { DEFAULT_BANDS } from '~~/analysis/verdict'
import type { GameReview } from '~~/analysis/game'
import type { GameEvent } from '~~/analysis/replay'
import type { Verdict } from '~~/analysis/verdict'

const VERDICT_LABEL: Record<Verdict, string> = {
    excellent: 'Meilleur coup',
    bon: 'Coup défendable',
    erreur: 'Erreur',
    faute: 'Faute',
}

/** Mesure : environ 3,4 s par decision au reglage par defaut. */
const SECONDS_PER_DECISION = 3.4

const route = useRoute()
const store = useGameStore()
const lobby = useLobbyStore()

const BANDS = DEFAULT_BANDS
const phase = ref<'idle' | 'running' | 'done'>('idle')
const error = ref('')
const players = ref<{ id: string; name: string }[]>([])
const events = ref<GameEvent[]>([])
const gridId = ref('01')
const target = ref('')
const review = ref<GameReview | null>(null)
const done = ref(0)
const total = ref(0)
const selected = ref<number | null>(null)
/**
 * Auteur de chaque decision de la partie, releve une fois par un rejeu a vide.
 * Le compte par joueur en decoule, donc changer de joueur met l'estimation a
 * jour sans rejouer quoi que ce soit.
 */
const decisionOwners = ref<string[]>([])
const decisionCount = computed(
    () => decisionOwners.value.filter(id => id === target.value).length,
)

const pct = computed(() => (total.value ? Math.round(100 * done.value / total.value) : 0))
const current = computed(() => (selected.value === null ? null : review.value?.moves[selected.value] ?? null))
const gridCells = computed(() => store.grid?.cells ?? [])

const playedCells = computed(() => new Set(current.value?.played?.placement ?? []))
const suggestedCells = computed(() =>
    current.value && !current.value.playedWasGood
        ? new Set(current.value.suggestion?.placement ?? [])
        : new Set<number>(),
)

const label = (seconds: number) => {
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`
    return `${Math.round(seconds / 60)} min`
}
const etaLabel = computed(() => label(decisionCount.value * SECONDS_PER_DECISION))
const remainingLabel = computed(() => label((total.value - done.value) * SECONDS_PER_DECISION))

/** Prepare un store neuf a partir des joueurs et de la grille de la partie. */
function primeStore() {
    store.initPlayers(players.value)
    store.initGrid(gridId.value)
}

onMounted(async () => {
    const gameId = route.params.id as string
    const supabase = useSupabaseClient()

    const [{ data: rows }, { data: game }, { data: log }] = await Promise.all([
        supabase.from('game_players').select('player_id, player_name, seat')
            .eq('game_id', gameId).order('seat', { ascending: true }),
        supabase.from('games').select('grid_id').eq('id', gameId).single(),
        supabase.from('game_events').select('event_type, payload')
            .eq('game_id', gameId).order('created_at', { ascending: true }),
    ])

    if (!rows?.length || !log?.length) {
        error.value = "Cette partie n'a aucun coup enregistré."
        return
    }

    players.value = rows.map(r => ({ id: r.player_id, name: r.player_name }))
    // `grid_id` a ete stocke tantot « 01 », tantot « grid-01 » selon les versions.
    gridId.value = (game?.grid_id ?? '01').replace(/^grid-/, '')
    events.value = log as GameEvent[]

    lobby.init()
    target.value = players.value.some(p => p.id === lobby.localPlayerId)
        ? lobby.localPlayerId
        : players.value[0].id

    // Un rejeu a vide donne le nombre de decisions, donc une estimation d'attente
    // honnete avant de lancer quoi que ce soit.
    primeStore()
    decisionOwners.value = replayDecisions(store, events.value).map(d => d.playerId)
})

async function run() {
    phase.value = 'running'
    done.value = 0
    total.value = decisionCount.value
    // Le rejeu consomme le store : il faut le remettre a neuf avant de rejouer.
    primeStore()
    try {
        review.value = await reviewGameAsync(store, events.value, {
            rolloutBot: makeGreedyV3Bot(V3_WEIGHTS, 'v3-multi'),
            playerId: target.value,
            onProgress: (d, t) => { done.value = d; total.value = t },
        })
        phase.value = 'done'
    } catch (e: any) {
        error.value = `L'analyse a échoué : ${e?.message ?? e}`
        phase.value = 'idle'
    }
}
</script>

<style scoped>
.page {
  @apply min-h-screen mx-auto px-4 py-10 flex flex-col gap-6;
  max-width: 1000px;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

.rv-header { @apply flex flex-col gap-1; }

.back {
  @apply text-xs font-bold uppercase tracking-wider;
  color: #8f8fa3;
}
.back:hover { color: #e8e8f0; }

.rv-title {
  @apply text-3xl font-black;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.lede { @apply text-sm leading-relaxed mt-1; color: #a0a0b8; max-width: 72ch; }

.card {
  @apply flex flex-col gap-3 rounded-2xl px-5 py-4;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}
.card--error { border-color: #e85a82; color: #e85a82; }

.label { @apply text-xs font-bold uppercase tracking-wider; color: #8f8fa3; }
.meta { @apply text-xs leading-relaxed; color: #8f8fa3; max-width: 78ch; }

.chips { @apply flex gap-2 flex-wrap; }

.chip {
  @apply px-3 py-1.5 rounded-lg text-sm font-bold cursor-pointer transition-all;
  background: #23232f;
  border: 2px solid #2e2e3e;
  color: #8f8fa3;
}
.chip:hover { border-color: #6e6e88; color: #e8e8f0; }
.chip--on { border-color: #f5d742; background: rgba(245, 215, 66, 0.1); color: #f5d742; }

.btn {
  @apply self-start rounded-xl px-5 py-2.5 text-sm font-black cursor-pointer transition-transform;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  color: #0f0f13;
}
.btn:hover:not(:disabled) { transform: translateY(-1px); }
.btn:disabled { opacity: 0.5; cursor: default; }

.bar {
  @apply w-full h-2 rounded-full overflow-hidden;
  background: #23232f;
}
.bar__fill {
  @apply h-full rounded-full;
  background: linear-gradient(90deg, #5cc96e, #f5d742);
  transition: width 0.2s ease;
}

.stats { @apply flex gap-6 flex-wrap; }
.stat { @apply flex flex-col; }
.stat__v {
  @apply text-2xl font-black;
  font-family: 'Space Mono', monospace;
  color: #e8e8f0;
}
.stat__v--good { color: #5cc96e; }
.stat__v--warn { color: #f5d742; }
.stat__v--bad { color: #e85a82; }
.stat__k { @apply text-xs; color: #8f8fa3; }

.moves { @apply flex flex-wrap gap-1.5; }

.move {
  @apply flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all;
  background: #23232f;
  border: 1px solid #2e2e3e;
  color: #a0a0b8;
}
.move:hover { border-color: #6e6e88; }
.move--on { border-color: #f5d742; }
.move--erreur { border-color: rgba(245, 215, 66, 0.5); }
.move--faute { border-color: rgba(232, 90, 130, 0.6); }

.move__turn { @apply font-black; font-family: 'Space Mono', monospace; color: #8f8fa3; }
.move__verdict { @apply font-bold; }
.move--erreur .move__verdict { color: #f5d742; }
.move--faute .move__verdict { color: #e85a82; }
.move__loss { @apply font-black; font-family: 'Space Mono', monospace; }
.move__loss--none { color: #8f8fa3; }

.grid-wrap { @apply flex flex-col gap-2; }

.mini {
  @apply grid gap-0.5 rounded-lg p-2;
  grid-template-columns: repeat(15, minmax(0, 1fr));
  background: #23232f;
  max-width: 520px;
}

.mini__cell {
  @apply rounded-sm;
  aspect-ratio: 1;
  opacity: 0.35;
}
.mini__cell--played { opacity: 1; box-shadow: 0 0 0 2px #e8e8f0; }
.mini__cell--suggested { opacity: 1; box-shadow: 0 0 0 2px #5cc96e; }

.legend { @apply flex gap-4 text-xs; color: #8f8fa3; }
.legend__item { @apply flex items-center gap-1.5; }
.swatch { @apply inline-block rounded-sm; width: 10px; height: 10px; }
.swatch--played { background: #e8e8f0; }
.swatch--suggested { background: #5cc96e; }
</style>
