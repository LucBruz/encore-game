<template>
  <div class="review">
    <p class="lede">
      Le moteur est mis à votre place, avec vos seules informations : votre feuille,
      celles des adversaires — publiques dans la règle — et le lancer du tour. Les dés
      à venir sont tirés au hasard, jamais ceux que vous avez réellement eus.
    </p>

    <div v-if="error" class="card card--error">{{ error }}</div>

    <!-- Choix du joueur puis lancement -->
    <div v-if="phase === 'idle'" class="card">
      <template v-if="!locked">
        <p class="label">Quel joueur analyser ?</p>
        <div class="chips">
          <button
            v-for="p in choices"
            :key="p.id"
            class="chip"
            :class="{ 'chip--on': target === p.id }"
            type="button"
            @click="target = p.id"
          >
            {{ p.name }}
          </button>
        </div>
      </template>
      <p v-else class="label">{{ isOwn ? 'Votre partie' : `Partie de ${targetName}` }}</p>
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
      <!-- Bilan -->
      <div class="card">
        <div class="summary-head">
          <p class="label">{{ isOwn ? 'Votre partie' : `Partie de ${review.playerName}` }} — {{ moves.length }} décisions</p>
          <button v-if="!locked" class="link-btn" type="button" @click="reset">Analyser un autre joueur</button>
        </div>
        <div class="tally">
          <div v-for="k in CLASS_ORDER" :key="k" class="tally__item">
            <span class="mark" :style="{ color: CLASS_META[k].color }">{{ CLASS_META[k].mark }}</span>
            <span class="tally__n">{{ counts[k] }}</span>
            <span class="tally__k">{{ CLASS_META[k].label }}</span>
          </div>
        </div>
        <p class="meta">
          L'outil ne reproche un coup que si l'écart au meilleur dépasse {{ BANDS.accuse }} points
          <em>et</em> sort du bruit de mesure. Il y a presque toujours plusieurs coups également
          défendables, donc pas de « meilleur coup » unique ; et pas de score de précision global
          non plus : l'analyse juge des coups, elle ne sait pas classer deux joueurs proches.
        </p>
      </div>

      <div v-if="!moves.length" class="card">
        <p class="meta">Ce joueur n'a aucune décision enregistrée dans cette partie.</p>
      </div>

      <template v-else>
        <!-- Courbe -->
        <div class="card">
          <p class="label">Écart au meilleur coup, tour par tour</p>
          <div class="chart">
            <div class="chart__threshold" :style="{ bottom: thresholdBottom }">
              <span>seuil de reproche · {{ BANDS.accuse }} pts</span>
            </div>
            <button
              v-for="(m, i) in moves"
              :key="i"
              class="chart__col"
              :class="{ 'chart__col--on': i === selected }"
              type="button"
              :aria-label="`Tour ${m.turn + 1}, ${CLASS_META[classOf(m)].label}`"
              @click="go(i)"
            >
              <span
                class="chart__bar"
                :style="{ height: barHeight(m), background: CLASS_META[classOf(m)].color }"
              />
            </button>
          </div>
          <div class="chart__axis">
            <span v-for="(m, i) in moves" :key="i">{{ axisLabel(m, i) }}</span>
          </div>
        </div>

        <!-- Plateau et liste des coups -->
        <div class="review-grid">
          <div v-if="current" class="card">
            <div class="board-head">
              <span class="mark mark--big" :style="{ color: currentMeta.color }">{{ currentMeta.mark }}</span>
              <div class="board-head__text">
                <p class="board-title">Tour {{ current.turn + 1 }} — {{ currentMeta.label }}</p>
                <p class="meta">{{ description }}</p>
              </div>
            </div>

            <div class="board">
              <span
                v-for="(cell, idx) in gridCells"
                :key="idx"
                class="bcell"
                :class="{
                  'bcell--checked': checkedSet.has(idx),
                  'bcell--played': playedSet.has(idx),
                  'bcell--suggested': suggestedSet.has(idx),
                }"
                :style="{ background: COLOR_MAP[cell[0]]?.hex }"
              >
                <span v-if="cell[1]" class="bcell__star">★</span>
                <span v-if="checkedSet.has(idx)" class="bcell__x">✕</span>
              </span>
            </div>

            <div class="legend">
              <span class="legend__item"><i class="swatch swatch--checked">✕</i> déjà coché</span>
              <span class="legend__item"><i class="swatch swatch--played" /> {{ isOwn ? 'votre coup' : 'coup joué' }}</span>
              <span v-if="suggestedSet.size" class="legend__item">
                <i class="swatch swatch--suggested" /> une alternative défendable
              </span>
            </div>

            <div class="nav">
              <button class="navbtn" type="button" :disabled="selected === 0" @click="go(0)">« Début</button>
              <button class="navbtn" type="button" :disabled="selected === 0" @click="go(selected - 1)">‹ Précédent</button>
              <button class="navbtn" type="button" :disabled="selected >= moves.length - 1" @click="go(selected + 1)">Suivant ›</button>
              <button class="navbtn" type="button" :disabled="selected >= moves.length - 1" @click="go(moves.length - 1)">Fin »</button>
            </div>
            <div class="nav">
              <button
                class="navbtn navbtn--err"
                type="button"
                :disabled="prevError === null"
                @click="prevError !== null && go(prevError)"
              >
                ‹ Erreur précédente
              </button>
              <button
                class="navbtn navbtn--err"
                type="button"
                :disabled="nextError === null"
                @click="nextError !== null && go(nextError)"
              >
                Erreur suivante ›
              </button>
            </div>
            <p class="hint">Flèches ← → du clavier pour passer d'un coup à l'autre.</p>
          </div>

          <div class="card">
            <p class="label">Coups</p>
            <ol class="movelist">
              <li v-for="(m, i) in moves" :key="i">
                <button
                  class="mrow"
                  :class="{ 'mrow--on': i === selected }"
                  :data-move="i"
                  type="button"
                  @click="go(i)"
                >
                  <span class="mrow__turn">{{ m.turn + 1 }}</span>
                  <span class="mrow__move">
                    <i v-if="m.played" class="dot" :style="{ background: COLOR_MAP[m.played.color]?.hex }" />
                    {{ m.played ? `× ${m.played.placement.length}` : 'Passe' }}
                  </span>
                  <span class="mark" :style="{ color: CLASS_META[classOf(m)].color }">{{ CLASS_META[classOf(m)].mark }}</span>
                  <span class="mrow__loss">{{ isReproached(m) ? `−${m.loss.toFixed(1)}` : '' }}</span>
                </button>
              </li>
            </ol>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { createPinia } from 'pinia'
import { useGameStore } from '~/stores/gameStore'
import { COLOR_MAP } from '~/data/grids/grid-01'
import { initialMoveIndex, pickReviewTarget } from '~/utils/reviewTarget'
import { V3_WEIGHTS } from '~/composables/useBotPlayer'
import { makeGreedyV3Bot } from '~~/bots/heuristicV3'
import { reviewGameAsync } from '~~/analysis/game'
import { replayDecisions } from '~~/analysis/replay'
import { DEFAULT_BANDS } from '~~/analysis/verdict'
import type { GameReview, ReviewedMove } from '~~/analysis/game'
import type { GameEvent } from '~~/analysis/replay'
import type { Verdict } from '~~/analysis/verdict'

/**
 * Analyse d'apres-partie, utilisable sur sa propre page (`/review/[id]`) comme
 * directement sur l'ecran de fin de partie.
 */
const props = defineProps<{
    gameId: string
    /**
     * Joueur local. S'il a joue cette partie, c'est la sienne qu'on analyse, sans
     * lui proposer de choix.
     */
    defaultPlayerId?: string
    /**
     * Lancer l'analyse des le chargement. Depuis l'ecran de fin, le bouton
     * « Analyser ma partie » exprime deja l'intention : un second clic sur
     * « Lancer l'analyse » n'apporterait rien.
     */
    autostart?: boolean
}>()

/**
 * Store PRIVE a l'analyse, sur sa propre instance Pinia.
 *
 * Le rejeu reinitialise le store qu'on lui donne. Sur l'ecran de fin de partie,
 * le store global est celui qui affiche les scores et les grilles : s'en servir
 * ici effacerait la partie que l'ecran est en train de montrer, des le lancement
 * de l'analyse.
 */
const store = useGameStore(createPinia())

/**
 * Classes affichees, empruntees aux annotations des echecs : `!` meilleur coup,
 * `?` erreur, `??` faute. Des marques typographiques plutot que des emoji.
 *
 * Le verdict « bon » recouvre deux cas distincts. Le coup appartient au groupe
 * que l'analyse ne sait pas departager du meilleur — il est defendable. Ou il
 * n'y appartient pas, mais l'ecart reste sous le seuil de reproche — il est
 * seulement sans reproche. Les confondre faisait mentir la page : sur une vraie
 * partie, 11 coups « defendables » pour un compteur qui en annoncait 8.
 */
type MoveClass = 'meilleur' | 'defendable' | 'sansReproche' | 'erreur' | 'faute'

const CLASS_ORDER: MoveClass[] = ['meilleur', 'defendable', 'sansReproche', 'erreur', 'faute']

const CLASS_META: Record<MoveClass, { mark: string; label: string; color: string }> = {
    meilleur: { mark: '!', label: 'Meilleur coup', color: '#5cc96e' },
    defendable: { mark: '✓', label: 'Défendable', color: '#5b9ff5' },
    sansReproche: { mark: '·', label: 'Sans reproche', color: '#8f8fa3' },
    erreur: { mark: '?', label: 'Erreur', color: '#f58a35' },
    faute: { mark: '??', label: 'Faute', color: '#e85a82' },
}

function classOf(m: { verdict: Verdict; playedWasGood: boolean }): MoveClass {
    if (m.verdict === 'excellent') return 'meilleur'
    if (m.verdict === 'bon') return m.playedWasGood ? 'defendable' : 'sansReproche'
    return m.verdict === 'faute' ? 'faute' : 'erreur'
}

const isReproached = (m: { verdict: Verdict }) => m.verdict === 'erreur' || m.verdict === 'faute'

/**
 * Cout mesure sur une partie reelle complete (0VITRI, 23 decisions, Node) :
 * 3,1 s pour une passe, 5,1 s pour un coup du bot — un coup en cours de partie
 * a davantage de candidats. 4,2 s en moyenne. Les scripts d'analyse annoncaient
 * 3,4 s parce qu'ils echantillonnent surtout des debuts de partie.
 */
const SECONDS_PER_DECISION = 4.2

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
const selected = ref(0)
/** Joueurs proposables — les humains — et vrai quand il n'y a rien a choisir. */
const choices = ref<{ id: string; name: string }[]>([])
const locked = ref(false)
/** C'est la partie de la personne qui regarde — pas seulement un choix verrouille. */
const isOwn = ref(false)
const targetName = computed(() => choices.value.find(p => p.id === target.value)?.name ?? '')

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

const label = (seconds: number) => {
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`
    return `${Math.round(seconds / 60)} min`
}
const etaLabel = computed(() => label(decisionCount.value * SECONDS_PER_DECISION))
const remainingLabel = computed(() => label((total.value - done.value) * SECONDS_PER_DECISION))

// ── Navigation ───────────────────────────────────────────────────────────────

const moves = computed<ReviewedMove[]>(() => review.value?.moves ?? [])
const current = computed(() => moves.value[selected.value] ?? null)
const currentMeta = computed(() => CLASS_META[current.value ? classOf(current.value) : 'sansReproche'])

const counts = computed(() => {
    const c: Record<MoveClass, number> = { meilleur: 0, defendable: 0, sansReproche: 0, erreur: 0, faute: 0 }
    for (const m of moves.value) c[classOf(m)]++
    return c
})

const reproached = computed(() =>
    moves.value.map((m, i) => (isReproached(m) ? i : -1)).filter(i => i >= 0),
)
const prevError = computed(() => [...reproached.value].reverse().find(i => i < selected.value) ?? null)
const nextError = computed(() => reproached.value.find(i => i > selected.value) ?? null)

function go(i: number) {
    if (!moves.value.length) return
    selected.value = Math.max(0, Math.min(moves.value.length - 1, i))
}

// La liste suit le coup choisi, meme quand on navigue depuis la courbe ou le clavier.
watch(selected, async i => {
    await nextTick()
    document.querySelector(`[data-move="${i}"]`)?.scrollIntoView({ block: 'nearest' })
})

function onKey(e: KeyboardEvent) {
    if (phase.value !== 'done') return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.key === 'ArrowLeft') { go(selected.value - 1); e.preventDefault() }
    else if (e.key === 'ArrowRight') { go(selected.value + 1); e.preventDefault() }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

// ── Courbe ───────────────────────────────────────────────────────────────────

/** Echelle commune : au moins de quoi voir le seuil, sinon le plus grand ecart. */
const chartMax = computed(() => Math.max(3, ...moves.value.map(m => m.loss)) * 1.1)
const barHeight = (m: ReviewedMove) =>
    `${Math.min(1, Math.max(0, m.loss) / chartMax.value) * 100}%`
const thresholdBottom = computed(() => `${(BANDS.accuse / chartMax.value) * 100}%`)
const axisLabel = (m: ReviewedMove, i: number) => {
    const step = Math.max(1, Math.ceil(moves.value.length / 15))
    return i % step === 0 || i === moves.value.length - 1 ? String(m.turn + 1) : ''
}

// ── Plateau ──────────────────────────────────────────────────────────────────

const gridCells = computed(() => store.grid?.cells ?? [])
const checkedSet = computed(() => new Set(current.value?.checkedBefore ?? []))
const playedSet = computed(() => new Set(current.value?.played?.placement ?? []))
/** Une alternative n'est montree que si le coup joue n'etait pas deja defendable. */
const suggestedSet = computed(() =>
    current.value && !current.value.playedWasGood
        ? new Set(current.value.suggestion?.placement ?? [])
        : new Set<number>(),
)

const points = (x: number) => x.toFixed(2).replace('.', ',')

const description = computed(() => {
    const m = current.value
    if (!m) return ''
    const possible = Math.max(0, m.legalMoves - 1)
    const parts = [
        `${possible} coup${possible > 1 ? 's' : ''} possible${possible > 1 ? 's' : ''} en plus de passer, `
        + `dont ${m.goodMoves.length} que l'analyse ne sait pas départager du meilleur.`,
    ]
    const played = isOwn.value ? 'Votre coup' : 'Le coup joué'
    if (m.verdict === 'excellent') parts.push("C'est celui qu'elle retient.")
    else if (m.playedWasGood) parts.push(`${played} en fait partie.`)
    else if (!isReproached(m)) {
        parts.push(`${played} n'en fait pas partie, mais l'écart (${points(m.loss)} pt) est trop faible pour être affirmé.`)
    } else {
        parts.push(`Écart estimé : ${points(m.loss)} ± ${points(m.loss95)} points.`)
    }
    return parts.join(' ')
})

// ── Chargement et analyse ────────────────────────────────────────────────────

/** Prepare le store prive a partir des joueurs et de la grille de la partie. */
function primeStore() {
    store.initPlayers(players.value)
    store.initGrid(gridId.value)
}

onMounted(async () => {
    const supabase = useSupabaseClient()

    const [{ data: rows }, { data: game }, { data: log }] = await Promise.all([
        supabase.from('game_players').select('player_id, player_name, seat')
            .eq('game_id', props.gameId).order('seat', { ascending: true }),
        supabase.from('games').select('grid_id').eq('id', props.gameId).single(),
        supabase.from('game_events').select('event_type, payload')
            .eq('game_id', props.gameId).order('created_at', { ascending: true }),
    ])

    if (!rows?.length || !log?.length) {
        error.value = "Cette partie n'a aucun coup enregistré."
        return
    }

    players.value = rows.map(r => ({ id: r.player_id, name: r.player_name }))
    // `grid_id` a ete stocke tantot « 01 », tantot « grid-01 » selon les versions.
    gridId.value = (game?.grid_id ?? '01').replace(/^grid-/, '')
    events.value = log as GameEvent[]

    // Lu apres le chargement : le joueur local peut n'etre connu qu'une fois la
    // page montee. On analyse la partie d'un joueur humain, jamais celle d'un
    // bot ; et quand c'est la sienne, sans rien lui faire choisir.
    const pick = pickReviewTarget(players.value, props.defaultPlayerId)
    choices.value = pick.choices
    locked.value = pick.locked
    isOwn.value = pick.isOwn
    target.value = pick.target ?? ''
    if (!pick.choices.length) {
        error.value = "Aucun joueur humain dans cette partie : il n'y a rien à analyser."
        return
    }

    // Un rejeu a vide donne le nombre de decisions, donc une estimation d'attente
    // honnete avant de lancer quoi que ce soit.
    primeStore()
    decisionOwners.value = replayDecisions(store, events.value).map(d => d.playerId)

    if (props.autostart && isOwn.value && target.value) void run()
})

async function run() {
    phase.value = 'running'
    error.value = ''
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
        selected.value = initialMoveIndex(review.value.moves)
        phase.value = 'done'
    } catch (e: any) {
        error.value = `L'analyse a échoué : ${e?.message ?? e}`
        phase.value = 'idle'
    }
}

function reset() {
    review.value = null
    selected.value = 0
    phase.value = 'idle'
}
</script>

<style scoped>
.review {
  @apply flex flex-col gap-6 w-full text-left;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

.lede { @apply text-sm leading-relaxed; color: #a0a0b8; max-width: 72ch; }

.card {
  @apply flex flex-col gap-3 rounded-2xl px-5 py-4 min-w-0;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}
.card--error { border-color: #e85a82; color: #e85a82; }

.label { @apply text-xs font-bold uppercase tracking-wider; color: #8f8fa3; }
.meta { @apply text-xs leading-relaxed; color: #8f8fa3; max-width: 78ch; }
.hint { @apply text-xs; color: #8f8fa3; }

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

.link-btn {
  @apply text-xs font-bold cursor-pointer;
  background: transparent;
  color: #5b9ff5;
}
.link-btn:hover { color: #e8e8f0; }

.bar {
  @apply w-full h-2 rounded-full overflow-hidden;
  background: #23232f;
}
.bar__fill {
  @apply h-full rounded-full;
  background: linear-gradient(90deg, #5cc96e, #f5d742);
  transition: width 0.2s ease;
}

/* ── Marques d'annotation ─────────────────────────────────────────────────── */

.mark {
  @apply font-black text-center;
  font-family: 'Space Mono', monospace;
  min-width: 1.8em;
}
.mark--big { @apply text-3xl leading-none; min-width: 1.6em; }

/* ── Bilan ─────────────────────────────────────────────────────────────────── */

.summary-head { @apply flex items-center justify-between gap-3 flex-wrap; }

.tally { @apply flex gap-2 flex-wrap; }
.tally__item {
  @apply flex items-center gap-2 rounded-xl px-3 py-2;
  background: #23232f;
}
.tally__n {
  @apply text-xl font-black;
  font-family: 'Space Mono', monospace;
  color: #e8e8f0;
}
.tally__k { @apply text-xs; color: #a0a0b8; }

/* ── Courbe ────────────────────────────────────────────────────────────────── */

.chart {
  @apply relative flex items-end;
  height: 130px;
  gap: 3px;
  padding: 0 2px;
  border-bottom: 1px solid #2e2e3e;
}

.chart__col {
  @apply flex items-end cursor-pointer;
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  padding: 0;
  background: transparent;
  border-radius: 4px 4px 0 0;
}
.chart__col:hover { background: rgba(255, 255, 255, 0.04); }
.chart__col--on {
  background: rgba(245, 215, 66, 0.1);
  box-shadow: inset 0 -3px 0 #f5d742;
}

.chart__bar {
  width: 100%;
  min-height: 3px;
  border-radius: 3px 3px 0 0;
}

.chart__threshold {
  @apply absolute left-0 right-0 pointer-events-none;
  border-top: 1px dashed #8f8fa3;
}
.chart__threshold span {
  @apply absolute right-1 text-xs;
  top: -18px;
  color: #8f8fa3;
  font-family: 'Space Mono', monospace;
}

.chart__axis {
  @apply flex;
  gap: 3px;
  padding: 4px 2px 0;
}
.chart__axis span {
  @apply text-center text-xs overflow-hidden;
  flex: 1 1 0;
  min-width: 0;
  color: #8f8fa3;
  font-family: 'Space Mono', monospace;
}

/* ── Plateau et liste ──────────────────────────────────────────────────────── */

/* Deux colonnes des que la place le permet, une seule sinon — y compris dans
   l'ecran de fin, plus etroit que la page. */
.review-grid {
  @apply grid gap-6;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
}

.board-head { @apply flex items-center gap-3; }
.board-head__text { @apply flex flex-col gap-1 min-w-0; }
.board-title { @apply text-base font-black; color: #e8e8f0; }

.board {
  @apply grid rounded-xl p-2;
  grid-template-columns: repeat(15, minmax(0, 1fr));
  gap: 3px;
  background: #23232f;
}

.bcell {
  @apply relative flex items-center justify-center;
  aspect-ratio: 1;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.22);
}
.bcell--checked { filter: brightness(0.8) saturate(0.9); }

/* Anneau decolle de la case par un liseré sombre : visible sur les cinq couleurs,
   jaune compris. Jaune pour le coup joue, comme la derniere case jouee aux echecs. */
.bcell--played {
  z-index: 1;
  box-shadow: 0 0 0 2px #0f0f13, 0 0 0 4px #f5d742;
}
.bcell--suggested {
  z-index: 1;
  box-shadow: 0 0 0 2px #0f0f13, 0 0 0 4px #5cc96e;
}

.bcell__x {
  @apply font-black leading-none pointer-events-none;
  color: #ffffff;
  font-family: 'Space Mono', monospace;
  font-size: clamp(9px, 1.3vw, 15px);
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.8);
}

.bcell__star {
  @apply absolute leading-none pointer-events-none;
  top: 1px;
  right: 2px;
  color: #ffffff;
  font-size: clamp(6px, 0.8vw, 10px);
  opacity: 0.85;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));
}

.legend { @apply flex gap-4 flex-wrap text-xs; color: #a0a0b8; }
.legend__item { @apply flex items-center gap-1.5; }
.swatch {
  @apply inline-flex items-center justify-center rounded-sm not-italic font-black;
  width: 12px;
  height: 12px;
  font-size: 9px;
}
.swatch--checked { background: #6e6e88; color: #ffffff; }
.swatch--played { box-shadow: 0 0 0 2px #f5d742; }
.swatch--suggested { box-shadow: 0 0 0 2px #5cc96e; }

.nav { @apply flex gap-2 flex-wrap; }

.navbtn {
  @apply px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all;
  background: #23232f;
  border: 1px solid #2e2e3e;
  color: #e8e8f0;
}
.navbtn:hover:not(:disabled) { border-color: #6e6e88; }
.navbtn:disabled { opacity: 0.4; cursor: default; }
.navbtn--err { color: #f58a35; }
.navbtn--err:hover:not(:disabled) { border-color: #f58a35; }

.movelist {
  @apply flex flex-col gap-1 overflow-y-auto;
  max-height: 520px;
}

.mrow {
  @apply w-full grid items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-all text-left;
  grid-template-columns: 2.2em minmax(0, 1fr) 2.2em 3.2em;
  background: transparent;
  border: 1px solid transparent;
  color: #e8e8f0;
}
.mrow:hover { background: #23232f; }
.mrow--on { background: rgba(245, 215, 66, 0.1); border-color: rgba(245, 215, 66, 0.45); }

.mrow__turn { @apply text-xs font-black; font-family: 'Space Mono', monospace; color: #8f8fa3; }
/* Sur le fond teinte de la ligne active, #8f8fa3 tombait a 4,34:1 — mesure en
   production, sous le seuil de 4,5. */
.mrow--on .mrow__turn { color: #a0a0b8; }
.mrow__move { @apply flex items-center gap-2 font-bold truncate; }
.mrow__loss {
  @apply text-xs font-black text-right;
  font-family: 'Space Mono', monospace;
  color: #f58a35;
}

.dot {
  @apply inline-block rounded-full shrink-0;
  width: 10px;
  height: 10px;
}
</style>
