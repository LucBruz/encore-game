<template>
  <div class="ia-page">
    <header class="ia-header">
      <NuxtLink to="/" class="back">← Retour</NuxtLink>
      <h1>Agents & benchmark</h1>
      <p class="lede">
        Comparaison d'agents sur la version headless du jeu. Toutes les mesures sont
        <strong>appariées</strong> : à index de partie égal, chaque agent affronte exactement
        la même suite de dés sur la même grille.
      </p>
    </header>

    <section v-if="evalData" class="card">
      <h2>Distribution des scores</h2>
      <p class="meta">
        {{ evalData.games }} parties par agent · mode de bonus <code>{{ evalData.mode }}</code> ·
        graine {{ evalData.seed }} · limite {{ evalData.maxTurns }} tours · 8 grilles officielles en rotation
      </p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>agent</th><th>moyenne</th><th>médiane</th><th>écart-type</th>
              <th>p10</th><th>p90</th><th>fin 2 couleurs</th><th>passes</th><th>ms/partie</th>
              <th>écart apparié vs {{ evalData.baseline }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in evalData.results" :key="r.bot" :class="{ 'row--best': r.bot === bestBot }">
              <td class="bot">{{ r.bot }}</td>
              <td class="num strong">{{ r.mean.toFixed(2) }}</td>
              <td class="num">{{ r.median }}</td>
              <td class="num">{{ r.stdev.toFixed(2) }}</td>
              <td class="num">{{ r.p10 }}</td>
              <td class="num">{{ r.p90 }}</td>
              <td class="num">{{ (r.naturalEndRate * 100).toFixed(1) }}%</td>
              <td class="num">{{ r.meanPasses.toFixed(2) }}</td>
              <td class="num dim">{{ r.msPerGame.toFixed(2) }}</td>
              <td class="num">
                <template v-if="r.paired">
                  <span :class="r.paired.significant ? (r.paired.delta > 0 ? 'good' : 'bad') : 'dim'">
                    {{ r.paired.delta > 0 ? '+' : '' }}{{ r.paired.delta.toFixed(2) }}
                  </span>
                  <span class="ci">[{{ r.paired.ci95[0] }}, {{ r.paired.ci95[1] }}]</span>
                </template>
                <span v-else class="dim">référence</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="histograms">
        <div v-for="r in evalData.results" :key="`h-${r.bot}`" class="histo">
          <div class="histo__title">
            {{ r.bot }}
            <span class="histo__mean">moyenne {{ r.mean.toFixed(1) }}</span>
          </div>
          <div class="histo__bars">
            <div
              v-for="b in r.histogram"
              :key="b.bin"
              class="histo__bar"
              :style="{
                height: `${(b.count / maxBinCount(r)) * 100}%`,
                left: `${((b.bin - histoMin) / histoSpan) * 100}%`,
                width: `${(5 / histoSpan) * 100}%`,
              }"
              :title="`${b.bin} à ${b.bin + 5} points : ${b.count} parties`"
            />
          </div>
          <div class="histo__axis">
            <span>{{ histoMin }}</span>
            <span>0</span>
            <span>{{ histoMin + histoSpan }}</span>
          </div>
        </div>
      </div>
    </section>

    <section v-if="tuned" class="card">
      <h2>Optimisation des poids par entropie croisée</h2>
      <p class="meta">
        Les poids de la fonction d'évaluation sont optimisés par CEM — échantillonner une
        gaussienne, garder les meilleurs, refitter sur eux. Sans gradient, robuste au bruit
        d'évaluation. Le résultat est validé sur un jeu de graines <strong>disjoint</strong>
        de celui d'optimisation.
      </p>

      <div class="holdout">
        <div class="holdout__item">
          <span class="holdout__label">poids à la main</span>
          <span class="holdout__value">{{ tuned.holdout.base.toFixed(2) }}</span>
        </div>
        <div class="holdout__arrow">→</div>
        <div class="holdout__item holdout__item--win">
          <span class="holdout__label">poids optimisés</span>
          <span class="holdout__value">{{ tuned.holdout.tuned.toFixed(2) }}</span>
        </div>
        <div class="holdout__delta">
          +{{ (tuned.holdout.tuned - tuned.holdout.base).toFixed(2) }} pts
          <span class="dim">sur {{ tuned.holdout.games }} parties hors échantillon</span>
        </div>
      </div>

      <svg class="curve" :viewBox="`0 0 ${curveW} ${curveH}`" preserveAspectRatio="none">
        <polyline :points="curvePoints(tuned.history, 'best')" class="curve__line curve__line--best" />
        <polyline :points="curvePoints(tuned.history, 'eliteMean')" class="curve__line curve__line--elite" />
      </svg>
      <div class="legend">
        <span class="legend__item"><i class="swatch swatch--best" /> meilleur candidat</span>
        <span class="legend__item"><i class="swatch swatch--elite" /> moyenne des élites</span>
        <span class="dim">itérations 0 → {{ tuned.history.length - 1 }}</span>
      </div>

      <h3>Poids appris</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>paramètre</th><th>à la main</th><th>optimisé</th></tr></thead>
          <tbody>
            <tr v-for="k in weightKeys" :key="k">
              <td class="bot">{{ k }}</td>
              <td class="num dim">{{ tuned.default[k] }}</td>
              <td class="num strong">{{ tuned.tuned[k].toFixed(3) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="note">
        Deux poids sont instructifs. <code>jokerValue</code> passe de 1 à
        {{ tuned.tuned.jokerValue.toFixed(2) }} : un joker vaut bien plus que le point
        qu'il rapporte à la fin. Et <code>colorExponent</code> tombe à
        {{ tuned.tuned.colorExponent.toFixed(2) }}, donc sous-linéaire — mieux vaut
        <strong>étaler ses croix</strong> sur plusieurs couleurs que d'en finir une. C'est
        exactement le conseil du livret : « Plus vous dispersez vos croix, plus vos
        possibilités de choix augmentent. » L'optimiseur l'a retrouvé seul, et l'effet se lit
        dans les passes par partie, qui s'effondrent.
      </p>
    </section>

    <section v-if="difficulty" class="card">
      <h2>Les trois niveaux</h2>
      <p class="meta">
        Une seule politique (<code>{{ difficulty.policy }}</code>), un seul bouton : une
        température softmax sur les valeurs z-scorées à chaque décision. À température
        nulle c'est la politique brute ; plus elle monte, plus l'agent pioche dans le haut
        du classement au lieu de prendre systématiquement le meilleur coup.
      </p>

      <div class="levels">
        <div v-for="l in difficulty.levels" :key="l.id" class="level">
          <span class="level__id">{{ l.id }}</span>
          <span class="level__score">{{ l.mean.toFixed(1) }}</span>
          <span class="level__meta">T = {{ l.temperature.toFixed(3) }} · écart-type {{ l.stdev.toFixed(1) }}</span>
        </div>
      </div>

      <p class="note">
        Les températures sont trouvées par <strong>dichotomie sur un score cible</strong>,
        pas réglées à la main. L'échelle obtenue est espacée de 1,8 puis 1,4 écart-type — un
        joueur sent la différence.
        <br><br>
        L'alternative naïve aurait été de prendre <code>random</code>, <code>greedy</code> et
        <code>greedy-cem</code> comme les trois niveaux. Elle ne marche pas : <code>random</code>
        est à <strong>7 écarts-types</strong> sous <code>greedy</code>, ce qui ne donne pas un
        adversaire facile mais un adversaire absurde ; et <code>greedy</code> n'est qu'à
        <strong>1 écart-type</strong> de <code>greedy-cem</code>, indistinguable sur une partie.
        Une échelle faite d'artefacts historiques est mal espacée par accident.
      </p>
    </section>

    <section class="card">
      <h2>Où est le plafond ?</h2>
      <p class="meta">
        Une fois les poids optimisés, la question devient : reste-t-il de la marge, et par
        quel moyen ? Deux sondes, chacune coûteuse, chacune comparée en apparié contre
        <code>greedy-cem</code>. Les deux résultats sont conservés ici, y compris quand ils
        sont négatifs.
      </p>

      <div class="probes">
        <div v-for="p in probes" :key="p.name" class="probe" :class="{ 'probe--null': !p.significant }">
          <div class="probe__head">
            <span class="probe__name">{{ p.name }}</span>
            <span class="probe__delta" :class="p.significant ? 'good' : 'dim'">
              {{ p.delta > 0 ? '+' : '' }}{{ p.delta.toFixed(2) }} pt
            </span>
          </div>
          <div class="probe__ci">
            intervalle 95 % [{{ p.ci[0] }}, {{ p.ci[1] }}]
            <strong v-if="!p.significant"> — indistinguable du bruit</strong>
          </div>
          <p class="probe__note">{{ p.note }}</p>
        </div>
      </div>

      <p class="note">
        <strong>Honnêteté sur ces deux sondes :</strong> elles testent au fond la même chose —
        « modéliser explicitement la flexibilité future aide-t-il ? ». La recherche l'estime
        par simulation, l'heuristique enrichie la compte directement. Ce sont donc deux
        résultats négatifs <em>corrélés</em>, pas deux confirmations indépendantes.
      </p>
    </section>

    <section class="card">
      <h2>Méthode</h2>
      <ul class="method">
        <li><strong>Moteur headless</strong> — les règles vivent dans <code>engine/</code>, en données pures, sans Vue ni Pinia. L'interface et les agents partagent la même implémentation, donc un agent ne peut pas s'entraîner sur des règles différentes de celles du jeu.</li>
        <li><strong>Énumération des coups</strong> — ESU (Wernicke) : chaque placement connexe est produit exactement une fois, sans passe de déduplication. La contrainte « un seul bloc de couleur » devient implicite.</li>
        <li><strong>Comparaisons appariées</strong> — même graine par index de partie pour tous les agents. Le bruit des dés est commun et s'annule dans les écarts.</li>
        <li><strong>Validation hors échantillon</strong> — les poids sont optimisés sur un jeu de graines et reportés sur un autre, disjoint.</li>
        <li><strong>Résultat négatif conservé</strong> — l'expectimax profondeur 2 n'apporte rien de mesurable pour 120× le coût. C'est une mesure, pas une omission.</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface EvalResult {
  bot: string
  mean: number
  median: number
  stdev: number
  p10: number
  p90: number
  naturalEndRate: number
  meanPasses: number
  msPerGame: number
  histogram: { bin: number; count: number }[]
  paired: Paired | null
}

interface Paired {
  vs: string
  delta: number
  stderr: number
  ci95: [number, number]
  significant: boolean
}

interface EvalData {
  mode: string
  games: number
  seed: number
  maxTurns: number
  baseline: string
  results: EvalResult[]
}

interface TunedData {
  tuned: Record<string, number>
  default: Record<string, number>
  history: { iter: number; best: number; eliteMean: number }[]
  holdout: { games: number; seed: number; base: number; tuned: number }
}

const { data: evalData } = await useFetch<EvalData>('/data/eval.json', { server: false })
const { data: tuned } = await useFetch<TunedData>('/data/tuned-weights.json', { server: false })
const { data: teacherData } = await useFetch<EvalData>('/data/eval-teacher.json', { server: false })
const { data: ceilingData } = await useFetch<EvalData>('/data/eval-ceiling.json', { server: false })

interface DifficultyData {
  policy: string
  games: number
  levels: { id: string; temperature: number; mean: number; stdev: number }[]
}
const { data: difficulty } = await useFetch<DifficultyData>('/data/difficulty.json', { server: false })

interface Probe { name: string; delta: number; ci: [number, number]; significant: boolean; note: string }

const PROBE_NOTES: Record<string, string> = {
  expectimax: "Un tour d'anticipation, moyenne sur 20 lancers échantillonnés, heuristique aux feuilles. Les dés sont entièrement relancés chaque tour : anticiper un lancer n'apprend presque rien que l'évaluation de position ne capture déjà.",
  'mc-cem': "192 déroulements complets par décision, joués par la politique optimisée. C'est une itération de politique — la seule chose qui batte vraiment greedy-cem, et pour environ 3 700 fois son coût.",
  'greedy-v2': "Heuristique à 21 paramètres : taille de frontière, couleurs encore accessibles, tables de valeur libres par niveau d'avancement. Rien que la forme à 6 paramètres ne captait déjà.",
  'greedy-v3': "Features dictées par un joueur : pénaliser les petits groupes qu'on ne pourra plus remplir, ouvrir des possibilités tôt, finir tôt les colonnes extrêmes, garder ses jokers, jouer les couleurs tard. Contrairement à la v2, les termes sont datés par le tour — c'est ce qui les rend utilisables.",
}

function probeFrom(data: EvalData | null, name: string): Probe | null {
  const r = data?.results.find(x => x.bot === name)
  if (!r?.paired) return null
  return {
    name,
    delta: r.paired.delta,
    ci: r.paired.ci95,
    significant: r.paired.significant,
    note: PROBE_NOTES[name] ?? '',
  }
}

const probes = computed((): Probe[] => {
  const out: Probe[] = []
  const mc = probeFrom(ceilingData.value, 'mc-cem')
  const ex = probeFrom(teacherData.value, 'expectimax')
  const v2 = probeFrom(evalData.value, 'greedy-v2')
  const v3 = probeFrom(evalData.value, 'greedy-v3')
  for (const p of [v3, mc, ex, v2]) if (p) out.push(p)
  return out
})

const weightKeys = [
  'columnExponent', 'colorExponent', 'colorValue', 'starValue', 'jokerValue', 'cellValue',
]

const bestBot = computed(() => {
  if (!evalData.value) return ''
  return [...evalData.value.results].sort((a, b) => b.mean - a.mean)[0]?.bot ?? ''
})

// Échelle commune à tous les histogrammes, sinon les formes ne sont pas comparables.
const histoMin = computed(() => {
  if (!evalData.value) return -25
  return Math.min(...evalData.value.results.flatMap(r => r.histogram.map(b => b.bin)))
})
const histoSpan = computed(() => {
  if (!evalData.value) return 75
  const max = Math.max(...evalData.value.results.flatMap(r => r.histogram.map(b => b.bin + 5)))
  return Math.max(5, max - histoMin.value)
})

function maxBinCount(r: EvalResult): number {
  return Math.max(1, ...r.histogram.map(b => b.count))
}

const curveW = 600
const curveH = 140

function curvePoints(history: TunedData['history'], key: 'best' | 'eliteMean'): string {
  if (!history.length) return ''
  const values = history.flatMap(h => [h.best, h.eliteMean])
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = Math.max(0.001, hi - lo)
  return history
    .map((h, i) => {
      const x = (i / Math.max(1, history.length - 1)) * curveW
      const y = curveH - ((h[key] - lo) / span) * (curveH - 12) - 6
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
</script>

<style scoped>
.ia-page {
  @apply mx-auto px-4 py-8 flex flex-col gap-6;
  max-width: 960px;
  color: #e8e8f0;
}

.ia-header h1 {
  @apply text-3xl font-black mt-2;
  font-family: 'Space Mono', monospace;
}

.back {
  @apply text-xs;
  color: #6e6e88;
}
.back:hover { color: #5cc96e; }

.lede {
  @apply text-sm mt-2 leading-relaxed;
  color: #a0a0b8;
  max-width: 70ch;
}

.card {
  @apply rounded-2xl p-5 flex flex-col gap-4;
  background: #17171f;
  border: 1px solid #2e2e3e;
}

.card h2 {
  @apply text-lg font-black;
  font-family: 'Space Mono', monospace;
}

.card h3 {
  @apply text-sm font-bold mt-2;
  color: #a0a0b8;
}

.meta {
  @apply text-xs leading-relaxed;
  color: #6e6e88;
  max-width: 75ch;
}

code {
  @apply px-1 rounded;
  background: #23232f;
  color: #f5d742;
  font-family: 'Space Mono', monospace;
}

.table-wrap { @apply overflow-x-auto; }

table {
  @apply w-full text-xs;
  border-collapse: collapse;
  font-family: 'Space Mono', monospace;
}

th {
  @apply text-left py-2 px-2 font-bold;
  color: #6e6e88;
  border-bottom: 1px solid #2e2e3e;
  white-space: nowrap;
}

td {
  @apply py-2 px-2;
  border-bottom: 1px solid #23232f;
  white-space: nowrap;
}

.num { @apply text-right; }
.strong { @apply font-black; color: #5cc96e; }
.dim { color: #6e6e88; }
.bot { color: #e8e8f0; }

.row--best { background: rgba(92, 201, 110, 0.07); }

.histograms { @apply grid gap-4 mt-2; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }

.histo {
  @apply rounded-xl p-3;
  background: #12121a;
  border: 1px solid #23232f;
}

.histo__title {
  @apply text-xs font-bold flex justify-between items-baseline mb-2;
  font-family: 'Space Mono', monospace;
}
.histo__mean { color: #6e6e88; font-weight: 400; }

.histo__bars {
  @apply relative w-full;
  height: 70px;
}

.histo__bar {
  @apply absolute bottom-0 rounded-t-sm;
  background: #5b9ff5;
  min-height: 1px;
}

.histo__axis {
  @apply flex justify-between text-xs mt-1;
  color: #4a4a5e;
  font-family: 'Space Mono', monospace;
}

.holdout {
  @apply flex items-center gap-4 flex-wrap rounded-xl p-4;
  background: #12121a;
  border: 1px solid #23232f;
}

.holdout__item { @apply flex flex-col; }
.holdout__label { @apply text-xs; color: #6e6e88; }
.holdout__value {
  @apply text-2xl font-black;
  font-family: 'Space Mono', monospace;
}
.holdout__item--win .holdout__value { color: #5cc96e; }
.holdout__arrow { color: #4a4a5e; }
.holdout__delta {
  @apply text-sm font-bold ml-auto flex flex-col items-end;
  color: #5cc96e;
}
.holdout__delta .dim { @apply text-xs font-normal; }

.curve {
  @apply w-full rounded-xl;
  height: 140px;
  background: #12121a;
  border: 1px solid #23232f;
}

.curve__line {
  fill: none;
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.curve__line--best { stroke: #5cc96e; }
.curve__line--elite { stroke: #5b9ff5; }

.legend { @apply flex items-center gap-4 text-xs flex-wrap; color: #6e6e88; }
.legend__item { @apply flex items-center gap-1.5; }
.swatch { @apply inline-block rounded-sm; width: 10px; height: 10px; }
.swatch--best { background: #5cc96e; }
.swatch--elite { background: #5b9ff5; }

.note {
  @apply text-xs leading-relaxed rounded-xl p-3;
  background: #12121a;
  border: 1px solid #23232f;
  color: #a0a0b8;
  max-width: 80ch;
}

.method {
  @apply flex flex-col gap-2 text-xs leading-relaxed;
  color: #a0a0b8;
  max-width: 80ch;
}
.method strong { color: #e8e8f0; }

.levels { @apply grid gap-3; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }

.level {
  @apply rounded-xl p-3 flex flex-col gap-1;
  background: #12121a;
  border: 1px solid #2e2e3e;
}
.level__id { @apply text-xs font-bold uppercase; color: #6e6e88; letter-spacing: 0.05em; }
.level__score {
  @apply text-2xl font-black;
  color: #5cc96e;
  font-family: 'Space Mono', monospace;
}
.level__meta { @apply text-xs; color: #6e6e88; font-family: 'Space Mono', monospace; }

.good { color: #5cc96e; font-weight: 700; }
.bad { color: #e85a82; font-weight: 700; }
.ci { @apply block text-xs; color: #4a4a5e; }

.probes { @apply grid gap-3; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }

.probe {
  @apply rounded-xl p-3 flex flex-col gap-1.5;
  background: #12121a;
  border: 1px solid #2e2e3e;
}
.probe--null { border-color: #3a2a33; }

.probe__head { @apply flex items-baseline justify-between gap-2; }
.probe__name { @apply text-sm font-bold; font-family: 'Space Mono', monospace; }
.probe__delta { @apply text-lg; font-family: 'Space Mono', monospace; }
.probe__ci { @apply text-xs; color: #6e6e88; font-family: 'Space Mono', monospace; }
.probe__ci strong { color: #e85a82; }
.probe__note { @apply text-xs leading-relaxed; color: #a0a0b8; }
</style>
