<template>
  <div class="ia-page">
    <header class="ia-header">
      <div class="ia-top">
        <NuxtLink to="/" class="back">{{ $t('common.back') }}</NuxtLink>
        <LangSwitch />
      </div>
      <h1>{{ $t('ia.title') }}</h1>
      <p class="lede">
        {{ $t('ia.lede') }}
        <NuxtLink to="/solo" class="link">{{ $t('ia.playThem') }}</NuxtLink>
      </p>
    </header>

    <!-- ─── Classement ─────────────────────────────────────────────────── -->
    <section class="card">
      <h2>{{ $t('ia.rankTitle') }}</h2>
      <p class="meta" v-html="$t('ia.rankMeta')" />

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ $t('ia.colAgent') }}</th><th>{{ $t('ia.colIdea') }}</th><th>{{ $t('ia.colVsV3') }}</th>
              <th>{{ $t('ia.colVsDenial') }}</th><th>{{ $t('ia.colTime') }}</th><th>{{ $t('ia.colInGame') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(a, i) in LADDER" :key="a.key" :class="{ 'row--best': i === 0 }">
              <td class="bot">{{ $t(`ia.agents.${a.key}.name`) }}</td>
              <td class="story">{{ $t(`ia.agents.${a.key}.idea`) }}</td>
              <td class="num" :class="a.vsV3 === null ? 'dim' : ''">{{ a.vsV3 === null ? '—' : pct(a.vsV3) + (a.star ? '*' : '') }}</td>
              <td class="num strong">{{ a.vsDenial === null ? '—' : pct(a.vsDenial) }}</td>
              <td class="num dim">{{ a.time === null ? $t('ia.timeFew') : time(a.time) }}</td>
              <td class="num" :class="a.inGame ? 'good' : 'dim'">{{ a.inGame ? $t('ia.yes') : $t('ia.notYet') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bars">
        <div v-for="(a, i) in LADDER.filter(l => l.vsDenial !== null)" :key="`b-${a.key}`" class="bar">
          <span class="bar__dot" :style="{ background: AGENT_COLORS[i % AGENT_COLORS.length] }" />
          <span class="bar__label">{{ $t(`ia.agents.${a.key}.name`) }}</span>
          <div class="bar__track">
            <div
              class="bar__fill"
              :style="{ width: `${a.vsDenial}%`, background: AGENT_COLORS[i % AGENT_COLORS.length] }"
            />
          </div>
          <span class="bar__value">{{ pct(a.vsDenial!) }}</span>
        </div>
        <p class="bars__caption">{{ $t('ia.barsCaption') }}</p>
      </div>

      <p class="note" v-html="$t('ia.rankNote')" />
    </section>

    <!-- ─── La leçon du protocole ──────────────────────────────────────── -->
    <section class="card card--lesson">
      <h2>{{ $t('ia.lessonTitle') }}</h2>
      <p class="meta" v-html="$t('ia.lessonMeta')" />

      <div class="flip">
        <div class="flip__col">
          <span class="flip__title">{{ $t('ia.solo') }}</span>
          <div class="flip__row flip__row--win"><span>{{ $t('ia.hoarder') }}</span><strong>{{ num(38.88, 2) }}</strong></div>
          <div class="flip__row"><span>{{ $t('ia.noPass') }}</span><strong>~36</strong></div>
        </div>
        <div class="flip__arrow">→</div>
        <div class="flip__col">
          <span class="flip__title">{{ $t('ia.table4') }}</span>
          <div class="flip__row flip__row--lose"><span>{{ $t('ia.hoarder') }}</span><strong>{{ num(15.11, 2) }}</strong></div>
          <div class="flip__row flip__row--win"><span>{{ $t('ia.noPass') }}</span><strong>{{ num(20.73, 2) }}</strong></div>
        </div>
      </div>

      <p class="note" v-html="$t('ia.lessonNote')" />
    </section>

    <!-- ─── Poids appris ───────────────────────────────────────────────── -->
    <section v-if="weightStories.length" class="card">
      <h2>{{ $t('ia.weightsTitle') }}</h2>
      <p class="meta" v-html="$t('ia.weightsMeta')" />

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>{{ $t('ia.colParam') }}</th><th>{{ $t('ia.colSolo') }}</th><th>{{ $t('ia.colMulti') }}</th><th>{{ $t('ia.colMeaning') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="w in weightStories" :key="w.key">
              <td class="bot">{{ w.key }}</td>
              <td class="num dim">{{ w.solo }}</td>
              <td class="num strong">{{ w.multi }}</td>
              <td class="story">{{ $t(`ia.stories.${w.key}`) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ─── Niveaux ────────────────────────────────────────────────────── -->
    <section v-if="difficulty" class="card">
      <h2>{{ $t('ia.levelsTitle') }}</h2>
      <p class="meta">{{ $t('ia.levelsMeta') }}</p>

      <div class="levels">
        <div v-for="l in difficulty.levels" :key="l.id" class="level">
          <span class="level__id">{{ l.id }}</span>
          <span class="level__score">{{ pct(l.winRate) }}</span>
          <span class="level__meta">
            T = {{ num(l.temperature, 3) }} · {{ $t('ia.levelScore') }} {{ num(l.meanScore, 1) }}
          </span>
        </div>
      </div>

      <p class="note" v-html="$t('ia.levelsNote')" />
    </section>

    <!-- ─── Réseau de neurones ─────────────────────────────────────────── -->
    <section class="card">
      <h2>{{ $t('ia.netTitle') }}</h2>
      <p class="meta" v-html="$t('ia.netMeta')" />

      <ol class="steps">
        <li v-for="(s, i) in NET_STEPS" :key="s.key" class="step">
          <span class="step__n">{{ i + 1 }}</span>
          <div class="step__body">
            <div class="step__head">
              <strong>{{ $t(`ia.steps.${s.key}.title`) }}</strong>
              <span class="step__result" :class="s.good ? 'good' : 'bad'">{{ $t(`ia.steps.${s.key}.result`) }}</span>
            </div>
            <p>{{ $t(`ia.steps.${s.key}.text`) }}</p>
          </div>
        </li>
      </ol>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>{{ $t('ia.diagSame') }}</th><th>{{ $t('ia.diagBy') }}</th><th>{{ $t('ia.diagGap') }}</th></tr>
          </thead>
          <tbody>
            <tr><td class="bot">{{ $t('ia.diagNetGames') }}</td><td>v3</td><td class="num">{{ gap(0.10, -0.10, 0.30) }}</td></tr>
            <tr class="row--bad"><td class="bot">{{ $t('ia.diagNetGames') }}</td><td>{{ $t('ia.diagTheNet') }}</td><td class="num">{{ gap(-0.55, -0.81, -0.30) }}</td></tr>
          </tbody>
        </table>
      </div>

      <p class="note" v-html="$t('ia.netNote')" />
    </section>

    <!-- ─── Déni de dés ────────────────────────────────────────────────── -->
    <section class="card">
      <h2>{{ $t('ia.denialTitle') }}</h2>
      <p class="meta" v-html="$t('ia.denialMeta')" />

      <div class="duo">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>{{ $t('ia.denialHeurHead') }}</th><th>{{ $t('ia.colWins') }}</th><th>{{ $t('ia.colPaired') }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in DENIAL_HEURISTIC" :key="d.w" :class="{ 'row--best': d.best }">
                <td class="bot">{{ $t('ia.price', { w: num(d.w, d.w % 1 ? 1 : 0) }) }}</td>
                <td class="num">{{ pct(d.win) }}</td>
                <td class="num" :class="d.gap ? 'good' : 'dim'">{{ d.gap ? gap(...d.gap) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>{{ $t('ia.denialNetHead') }}</th><th>{{ $t('ia.colVsV3Short') }}</th><th>{{ $t('ia.colPaired') }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in DENIAL_NET" :key="d.w" :class="{ 'row--best': d.best }">
                <td class="bot">{{ $t('ia.price', { w: num(d.w, d.w % 1 ? 1 : 0) }) }}</td>
                <td class="num">{{ pct(d.win) }}</td>
                <td class="num good">{{ gap(...d.gap) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p class="note" v-html="$t('ia.denialNote')" />
    </section>

    <!-- ─── Recherche ──────────────────────────────────────────────────── -->
    <section class="card">
      <h2>{{ $t('ia.searchTitle') }}</h2>
      <p class="meta" v-html="$t('ia.searchMeta')" />

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ $t('ia.colOpponent') }}</th><th>{{ $t('ia.colTable') }}</th><th>{{ $t('ia.colSearchWins') }}</th>
              <th>{{ $t('ia.colPaired') }}</th><th>{{ $t('ia.colGames') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in SEARCH_RESULTS" :key="r.id" :class="{ 'row--caveat': r.caveat }">
              <td class="bot">{{ r.opponent === 'netDenial' ? $t('ia.agents.netDenial.name') : r.opponent }}</td>
              <td>{{ $t(`ia.${r.table}`) }}</td>
              <td class="num" :class="r.caveat ? 'dim' : 'strong'">
                {{ r.perSeat ? $t('ia.perSeat', { v: pct(r.win) }) : pct(r.win) }}
              </td>
              <td class="num">{{ gap(...r.gap) }}</td>
              <td class="num dim">{{ r.games }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="note" v-html="$t('ia.searchNote')" />
    </section>

    <!-- ─── Méthode ────────────────────────────────────────────────────── -->
    <section class="card">
      <h2>{{ $t('ia.methodTitle') }}</h2>
      <ul class="method">
        <li v-for="k in ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']" :key="k" v-html="$t(`ia.method.${k}`)" />
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface DifficultyData {
  policy: string
  levels: { id: string; temperature: number; winRate: number; meanScore: number }[]
}
interface MultiData { tuned: Record<string, number>; from: Record<string, number> }

const { locale } = useI18n()

const { data: difficulty } = await useFetch<DifficultyData>('/data/difficulty.json', { server: false })
const { data: multi } = await useFetch<MultiData>('/data/tuned-weights-multi.json', { server: false })

/** Les cinq couleurs de la grille, pour rester dans l'univers visuel du jeu. */
const AGENT_COLORS = ['#5cc96e', '#5b9ff5', '#f5d742', '#f58a35', '#e85a82']

// ── Formatage des nombres selon la langue ────────────────────────────────────
// Virgule decimale et « % » espace en francais, point et « % » colle en anglais ;
// le moins typographique « − » dans les deux cas.

const fr = computed(() => locale.value === 'fr')
function num(x: number, digits = 1): string {
  const s = Math.abs(x).toFixed(digits)
  return (x < 0 ? '−' : '') + (fr.value ? s.replace('.', ',') : s)
}
const signed = (x: number, digits = 2) => (x > 0 ? '+' : '') + num(x, digits)
const pct = (x: number) => num(x, 1) + (fr.value ? ' %' : '%')
const time = (ms: number) => (ms >= 100 ? `~${num(ms / 1000, 1)} s` : `${num(ms, ms < 1 ? 2 : 1)} ms`)
/** Ecart apparie et son intervalle a 95 %. */
function gap(mean: number, lo: number, hi: number): string {
  const sep = fr.value ? ' ; ' : ', '
  return `${signed(mean)} [${signed(lo)}${sep}${signed(hi)}]`
}

/**
 * Mesures figees (tete-a-tete, 2000 parties sauf mention, graines 5250000). Les
 * fichiers de resultats ont ete retires du site : les chiffres et leur protocole
 * sont consignes dans CLAUDE.md. `time` en millisecondes, `null` = « quelques ms ».
 */
const LADDER: { key: string; vsV3: number | null; star?: boolean; vsDenial: number | null; time: number | null; inGame: boolean }[] = [
  { key: 'search', vsV3: 84.0, star: true, vsDenial: 74.8, time: 500, inGame: false },
  { key: 'netDenial', vsV3: 73.4, vsDenial: 55.4, time: null, inGame: false },
  { key: 'net', vsV3: 63.7, vsDenial: 49.3, time: 1.6, inGame: false },
  { key: 'deni', vsV3: 63.6, vsDenial: null, time: 1.2, inGame: false },
  { key: 'v3', vsV3: null, vsDenial: 36.4, time: 0.18, inGame: true },
]

const NET_STEPS = [
  { key: 's1', good: false },
  { key: 's2', good: false },
  { key: 's3', good: true },
  { key: 's4', good: true },
  { key: 's5', good: true },
]

type Gap = [number, number, number]

/** Heuristique v3-multi + deni, table de 4, 1600 parties : ecart apparie contre le meme agent sans deni. */
const DENIAL_HEURISTIC: { w: number; win: number; gap: Gap | null; best: boolean }[] = [
  { w: 0, win: 19.7, gap: null, best: false },
  { w: 0.6, win: 23.8, gap: [1.12, 0.67, 1.56], best: false },
  { w: 0.8, win: 26.9, gap: [1.69, 1.24, 2.13], best: true },
  { w: 1.1, win: 29.6, gap: [1.70, 1.23, 2.16], best: true },
  { w: 1.6, win: 27.1, gap: [1.27, 0.81, 1.73], best: false },
]

/** Reseau (tete marge) + deni, tete-a-tete contre v3-multi, 2000 parties. */
const DENIAL_NET: { w: number; win: number; gap: Gap; best: boolean }[] = [
  { w: 0, win: 63.7, gap: [3.24, 2.78, 3.70], best: false },
  { w: 0.5, win: 71.5, gap: [5.53, 5.08, 5.99], best: false },
  { w: 1, win: 73.4, gap: [6.00, 5.53, 6.46], best: true },
  { w: 2, win: 66.6, gap: [4.30, 3.82, 4.78], best: false },
]

/** Recherche 4 coups x 16 simulations x 4 tours, adversaires simules par v3-multi. */
const SEARCH_RESULTS: { id: string; opponent: string; table: string; win: number; perSeat?: boolean; gap: Gap; games: number; caveat: boolean }[] = [
  { id: 'deni', opponent: 'deni-0.8', table: 'table2', win: 74.8, gap: [7.18, 6.11, 8.25], games: 400, caveat: false },
  { id: 'deni-3', opponent: 'deni-0.8', table: 'table3', win: 53.2, perSeat: true, gap: [6.48, 5.68, 7.27], games: 402, caveat: false },
  { id: 'deni-4', opponent: 'deni-0.8', table: 'table4mix', win: 40.8, perSeat: true, gap: [5.73, 5.09, 6.37], games: 402, caveat: false },
  { id: 'net-deni', opponent: 'netDenial', table: 'table2', win: 61.8, gap: [2.51, 1.46, 3.56], games: 400, caveat: false },
  { id: 'v3', opponent: 'v3-multi', table: 'table2', win: 84.0, gap: [10.96, 9.87, 12.05], games: 400, caveat: true },
]

/** Parametres de v3 dont l'evolution solitaire -> multijoueur se raconte (textes dans ia.stories). */
const STORY_KEYS = ['colorExponent', 'lateHorizon', 'colorValueLate', 'jokerValue', 'orphan1', 'extremeColumnEarly', 'cellValue']

const weightStories = computed(() => {
  const m = multi.value
  if (!m) return []
  return STORY_KEYS
    .filter(k => m.tuned[k] !== undefined)
    .map(k => ({
      key: k,
      solo: m.from[k] !== undefined ? num(m.from[k], 2) : '—',
      multi: num(m.tuned[k], 2),
    }))
})
</script>

<style scoped>
/* Charte identique au reste du jeu : fond #0f0f13, cartes #1a1a24,
   encarts #23232f, bordures #2e2e3e, Nunito pour le texte et Space Mono
   pour tout ce qui est chiffre. */
.ia-page {
  @apply min-h-screen mx-auto px-4 py-10 flex flex-col gap-6;
  max-width: 1000px;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

.ia-header { @apply flex flex-col gap-1; }

.ia-top { @apply flex items-center justify-between gap-3; }

.ia-header h1 {
  @apply text-4xl font-black tracking-tight mt-1;
  font-family: 'Space Mono', monospace;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.back {
  @apply text-xs font-bold uppercase tracking-wider transition-colors;
  color: #8f8fa3;
}
.back:hover { color: #f5d742; }

.link { color: #5b9ff5; font-weight: 700; }
.link:hover { text-decoration: underline; }

.lede { @apply text-sm leading-relaxed mt-1; color: #a0a0b8; max-width: 72ch; }

.card {
  @apply flex flex-col gap-4 p-6 rounded-2xl;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.card--lesson { border-color: #f58a35; }

.card h2 {
  @apply text-lg font-black;
  color: #f5d742;
}

.meta { @apply text-xs leading-relaxed; color: #8f8fa3; max-width: 78ch; }
.meta strong { color: #e8e8f0; }

code {
  @apply px-1.5 py-0.5 rounded;
  background: #23232f;
  color: #f5d742;
  font-family: 'Space Mono', monospace;
  font-size: 0.9em;
}

/* ── Tableaux ─────────────────────────────────────────────────────────────── */

.table-wrap { @apply overflow-x-auto rounded-xl; }

table {
  @apply w-full text-xs;
  border-collapse: collapse;
  font-family: 'Space Mono', monospace;
}

th {
  @apply text-left py-2.5 px-3 font-bold uppercase tracking-wider;
  color: #8f8fa3;
  background: #23232f;
  white-space: nowrap;
  font-size: 0.68rem;
}

th:first-child { border-top-left-radius: 0.75rem; }
th:last-child { border-top-right-radius: 0.75rem; }

td {
  @apply py-2.5 px-3;
  border-bottom: 1px solid #23232f;
  white-space: nowrap;
}

tbody tr:last-child td { border-bottom: none; }

.num { @apply text-right; }
.strong { @apply font-black; color: #5cc96e; }
.dim { color: #8f8fa3; }
.good { color: #5cc96e; }
.bad { color: #e85a82; }
.bot { color: #e8e8f0; font-weight: 700; }

.story {
  @apply text-xs;
  color: #a0a0b8;
  white-space: normal;
  min-width: 24ch;
  font-family: 'Nunito', sans-serif;
}

.row--best { background: rgba(92, 201, 110, 0.08); }
.row--best .bot { color: #5cc96e; }
.row--bad { background: rgba(232, 90, 130, 0.08); }
.row--caveat { opacity: 0.7; }

.duo {
  @apply grid gap-3;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

/* ── Barres de victoires ──────────────────────────────────────────────────── */

.bars {
  @apply flex flex-col gap-2.5 p-4 rounded-xl;
  background: #23232f;
  border: 1px solid #2e2e3e;
}

.bars__caption {
  @apply text-xs mt-1;
  color: #8f8fa3;
}

.bar { @apply flex items-center gap-3 text-xs; }

.bar__dot {
  @apply shrink-0 rounded-full;
  width: 9px;
  height: 9px;
}

.bar__label {
  @apply shrink-0 font-bold;
  width: 16ch;
  color: #a0a0b8;
  font-family: 'Space Mono', monospace;
}

.bar__track {
  @apply flex-1 rounded-full overflow-hidden;
  height: 8px;
  background: #0f0f13;
}

.bar__fill {
  @apply rounded-full;
  height: 8px;
  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.bar__value {
  @apply shrink-0 text-right font-black;
  width: 6ch;
  color: #e8e8f0;
  font-family: 'Space Mono', monospace;
}

/* ── Renversement solitaire / multijoueur ─────────────────────────────────── */

.flip { @apply flex items-stretch gap-3 flex-wrap; }

.flip__col {
  @apply flex-1 rounded-xl p-4 flex flex-col gap-2.5;
  min-width: min(250px, 100%);
  background: #23232f;
  border: 1px solid #2e2e3e;
}

.flip__title {
  @apply text-xs font-bold uppercase tracking-wider;
  color: #8f8fa3;
}

.flip__row {
  @apply flex items-baseline justify-between gap-3 text-xs;
  color: #a0a0b8;
}

.flip__row strong {
  @apply text-xl font-black;
  font-family: 'Space Mono', monospace;
  color: #e8e8f0;
}

.flip__row--win strong { color: #5cc96e; }
.flip__row--lose strong { color: #e85a82; }

.flip__arrow {
  @apply self-center text-2xl;
  color: #f58a35;
}

/* ── Étapes du réseau ─────────────────────────────────────────────────────── */

.steps { @apply flex flex-col gap-3; }

.step {
  @apply flex gap-3 p-4 rounded-xl;
  background: #23232f;
  border: 1px solid #2e2e3e;
}

.step__n {
  @apply shrink-0 flex items-center justify-center rounded-full text-xs font-black;
  width: 26px;
  height: 26px;
  background: #0f0f13;
  color: #f5d742;
  font-family: 'Space Mono', monospace;
}

.step__body { @apply flex flex-col gap-1.5 min-w-0; }

.step__head {
  @apply flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm;
  color: #e8e8f0;
}

.step__result {
  @apply text-sm font-black;
  font-family: 'Space Mono', monospace;
}

.step__body p {
  @apply text-xs leading-relaxed;
  color: #a0a0b8;
}

/* ── Niveaux ──────────────────────────────────────────────────────────────── */

.levels {
  @apply grid gap-3;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.level {
  @apply rounded-xl p-4 flex flex-col gap-1.5;
  background: #23232f;
  border: 2px solid #2e2e3e;
  transition: border-color 0.2s;
}

.level:last-child {
  border-color: #f5d742;
  background: rgba(245, 215, 66, 0.08);
}

.level__id {
  @apply text-xs font-black uppercase tracking-wider;
  color: #8f8fa3;
}

.level:last-child .level__id { color: #f5d742; }

.level__score {
  @apply text-3xl font-black;
  color: #5cc96e;
  font-family: 'Space Mono', monospace;
  line-height: 1;
}

.level__meta {
  @apply text-xs;
  color: #8f8fa3;
  font-family: 'Space Mono', monospace;
}

/* ── Encarts explicatifs ──────────────────────────────────────────────────── */

.note {
  @apply text-xs leading-relaxed p-4 rounded-xl;
  background: #23232f;
  border-left: 3px solid #f5d742;
  color: #a0a0b8;
  max-width: 84ch;
}

.note strong { color: #e8e8f0; }

.method {
  @apply flex flex-col gap-2.5 text-xs leading-relaxed;
  color: #a0a0b8;
  max-width: 84ch;
}

.method li {
  @apply pl-4;
  border-left: 2px solid #2e2e3e;
}

.method strong { color: #e8e8f0; }
</style>
