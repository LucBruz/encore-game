<template>
  <div class="ia-page">
    <header class="ia-header">
      <NuxtLink to="/" class="back">← Retour</NuxtLink>
      <h1>Agents & benchmark</h1>
      <p class="lede">
        Des agents de jeu construits sur un moteur de règles headless, et surtout la mesure
        qui permet de dire lequel est meilleur — et de combien.
        <NuxtLink to="/solo" class="link">Jouer contre eux →</NuxtLink>
      </p>
    </header>

    <!-- ─── Tournoi multijoueur : le résultat qui fait foi ─────────────── -->
    <section v-if="duel" class="card">
      <h2>Tournoi à {{ duel.seats }} joueurs</h2>
      <p class="meta">
        {{ duel.games }} parties, tables de {{ duel.seats }} tirées parmi
        {{ duel.agents.length }} agents avec rotation des sièges, 8 grilles officielles.
        Durée moyenne {{ duel.meanTurns }} tours,
        {{ (duel.naturalEndRate * 100).toFixed(1) }} % des parties terminées par deux
        couleurs complètes.
      </p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>agent</th><th>score moyen</th><th>victoires</th>
              <th>a terminé la partie</th><th>passes</th><th>jokers dépensés</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(a, i) in duel.agents" :key="a.name" :class="{ 'row--best': i === 0 }">
              <td class="bot">{{ a.name }}</td>
              <td class="num strong">{{ a.meanScore.toFixed(2) }}</td>
              <td class="num">{{ a.winRate.toFixed(1) }} %</td>
              <td class="num">{{ a.endRate.toFixed(1) }} %</td>
              <td class="num dim">{{ a.meanPasses.toFixed(2) }}</td>
              <td class="num dim">{{ a.meanJokers.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bars">
        <div v-for="(a, i) in duel.agents" :key="`b-${a.name}`" class="bar">
          <span class="bar__dot" :style="{ background: AGENT_COLORS[i % AGENT_COLORS.length] }" />
          <span class="bar__label">{{ a.name }}</span>
          <div class="bar__track">
            <div
              class="bar__fill"
              :style="{
                width: `${(a.winRate / maxWin) * 100}%`,
                background: AGENT_COLORS[i % AGENT_COLORS.length],
              }"
            />
          </div>
          <span class="bar__value">{{ a.winRate.toFixed(1) }} %</span>
        </div>
      </div>

      <p class="note">
        Le vainqueur est aussi celui qui <strong>termine</strong> les parties :
        {{ duel.agents[0].endRate.toFixed(1) }} % contre
        {{ duel.agents[duel.agents.length - 1].endRate.toFixed(1) }} % pour le dernier. En
        Encore!, aller vite est une stratégie et non un effet de bord — compléter deux
        couleurs met fin à la partie et coupe tout le monde.
      </p>
    </section>

    <!-- ─── La leçon du projet ─────────────────────────────────────────── -->
    <section class="card card--lesson">
      <h2>Le protocole comptait plus que l'algorithme</h2>
      <p class="meta">
        Les agents ont d'abord été optimisés <strong>en solitaire</strong> : une feuille,
        pas d'adversaire, une limite de 50 tours posée comme garde-fou anti-boucle. Ce
        cadrage classe les agents <strong>à l'envers au sommet</strong>.
      </p>

      <div class="flip">
        <div class="flip__col">
          <span class="flip__title">en solitaire</span>
          <div class="flip__row flip__row--win"><span>agent thésauriseur</span><strong>38,88</strong></div>
          <div class="flip__row"><span>le même, sans droit de passer</span><strong>~36</strong></div>
        </div>
        <div class="flip__arrow">→</div>
        <div class="flip__col">
          <span class="flip__title">à une table de 4</span>
          <div class="flip__row flip__row--lose"><span>agent thésauriseur</span><strong>15,11</strong></div>
          <div class="flip__row flip__row--win"><span>le même, sans droit de passer</span><strong>20,73</strong></div>
        </div>
      </div>

      <p class="note">
        Le solitaire ne punit pas la temporisation, puisque l'agent y décide seul quand la
        partie s'arrête. Il avait donc appris à thésauriser ses 8 jokers — +8 points
        garantis au décompte — et à passer 12 fois par partie. À une vraie table, les
        autres finissent à sa place.
        <br><br>
        Trois choses n'existent que dans le simulateur multijoueur : le <strong>déni de
        dés</strong> (le joueur actif met sa paire de côté, les passifs n'ont que les 4
        restants), la <strong>fin décidée par autrui</strong>, et les bonus
        <strong>premier / suivants</strong> qui récompensent la vitesse.
      </p>
    </section>

    <!-- ─── Poids appris ───────────────────────────────────────────────── -->
    <section v-if="weightStories.length" class="card">
      <h2>Ce que l'optimiseur a appris</h2>
      <p class="meta">
        Les poids de l'évaluation sont optimisés par <strong>entropie croisée</strong> —
        échantillonner une gaussienne, garder les meilleurs, refitter sur eux. Sans
        gradient, robuste au bruit de mesure. La cible est la marge contre le meilleur
        adversaire de la table, et le panel d'adversaires est volontairement hétérogène :
        s'entraîner contre un seul style apprendrait à battre ce style, pas à jouer.
      </p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>paramètre</th><th>solitaire</th><th>multijoueur</th><th>ce que ça dit</th></tr>
          </thead>
          <tbody>
            <tr v-for="w in weightStories" :key="w.key">
              <td class="bot">{{ w.key }}</td>
              <td class="num dim">{{ w.solo }}</td>
              <td class="num strong">{{ w.multi }}</td>
              <td class="story">{{ w.story }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ─── Niveaux ────────────────────────────────────────────────────── -->
    <section v-if="difficulty" class="card">
      <h2>Les trois niveaux</h2>
      <p class="meta">
        Une seule politique, un seul bouton : une température softmax sur les valeurs
        z-scorées à chaque décision. À température nulle c'est la politique brute ; plus
        elle monte, plus l'agent pioche dans le haut du classement au lieu de prendre
        systématiquement le meilleur coup.
      </p>

      <div class="levels">
        <div v-for="l in difficulty.levels" :key="l.id" class="level">
          <span class="level__id">{{ l.id }}</span>
          <span class="level__score">{{ l.winRate.toFixed(1) }} %</span>
          <span class="level__meta">
            T = {{ l.temperature.toFixed(3) }} · score {{ l.meanScore.toFixed(1) }}
          </span>
        </div>
      </div>

      <p class="note">
        Les températures sont trouvées par <strong>dichotomie sur un taux de victoire
        cible</strong>, mesuré en partie à 4 contre trois exemplaires du niveau maximal. La
        cible est un taux de victoire et non un score : à une table de 4, un score absolu
        dépend autant des adversaires que de l'agent, alors que la fréquence de victoire
        est ce qu'un joueur ressent. Le plafond est ~25 %, quatre joueurs identiques se
        partageant les victoires.
        <br><br>
        Le softmax est préféré à l'ε-greedy, qui produit des <strong>bourdes</strong> :
        jouer parfaitement puis poser cinq croix n'importe où. Un joueur faible joue un
        coup correct mais pas le meilleur, ce que le softmax reproduit.
      </p>
    </section>

    <!-- ─── Déni de dés ────────────────────────────────────────────────── -->
    <section class="card">
      <h2>Le déni de dés : mesuré, puis écarté</h2>
      <p class="meta">
        Quand on est joueur actif, le choix a deux effets : ce qu'il rapporte, et ce qu'il
        retire aux autres. Aucun agent ne modélisait le second. Mesure isolée — mêmes poids
        partout, seul le prix du déni change, 1600 parties.
      </p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>prix du déni</th><th>score</th><th>victoires</th><th>écart apparié vs sans déni</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in denialRows" :key="d.w" :class="{ 'row--best': d.best }">
              <td class="bot">{{ d.w }}</td>
              <td class="num">{{ d.score }}</td>
              <td class="num">{{ d.win }}</td>
              <td class="num" :class="d.delta === '—' ? 'dim' : 'good'">{{ d.delta }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="note">
        Le gain est réel et l'optimum est <strong>intérieur</strong> : trop dénier nuit
        aussi. Il a fallu au préalable énumérer les coups <strong>par paire de dés</strong>,
        la génération normale fusionnant les paires équivalentes pour soi — dans plus de 8
        tours sur 10 — et jetant donc exactement l'information qui compte pour autrui.
        <br><br>
        <strong>Non intégré au jeu</strong>, par choix : lire les feuilles adverses
        complique nettement le bot, et rendre l'adversaire plus fort n'était pas l'objectif.
      </p>
    </section>

    <!-- ─── Méthode ────────────────────────────────────────────────────── -->
    <section class="card">
      <h2>Méthode</h2>
      <ul class="method">
        <li><strong>Moteur headless</strong> — les règles vivent dans <code>engine/</code>, en données pures, sans Vue ni Pinia. L'interface et les agents partagent la même implémentation, donc un agent ne peut pas être optimisé sur des règles différentes de celles auxquelles on joue.</li>
        <li><strong>Énumération des coups</strong> — ESU (Wernicke) : chaque placement connexe est produit exactement une fois, sans passe de déduplication. La contrainte « un seul bloc de couleur » devient implicite.</li>
        <li><strong>Comparaisons appariées</strong> — à index de partie égal, tous les agents reçoivent la même graine, donc les mêmes dés sur la même grille. Le bruit est commun et s'annule dans les écarts.</li>
        <li><strong>Incertitude reportée</strong> — chaque écart vient avec son intervalle à 95 %. Une différence de moyennes ne veut rien dire sans savoir de combien elle fluctue.</li>
        <li><strong>Validation hors échantillon</strong> — les poids sont optimisés sur un jeu de graines et reportés sur un autre, disjoint.</li>
        <li><strong>Résultats négatifs conservés</strong> — l'expectimax profondeur 2 n'apporte rien de mesurable pour 140× le coût, et une heuristique à 21 paramètres à compteurs plats fait moins bien qu'à 6. Ce sont des mesures, pas des omissions. Elles ont été faites en solitaire, donc dans le cadrage dont on sait maintenant qu'il classe mal : ce sont des constats sur ce cadrage, pas des verdicts sur le jeu.</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface DuelAgent {
  name: string
  games: number
  meanScore: number
  winRate: number
  endRate: number
  meanPasses: number
  meanJokers: number
}
interface DuelData {
  games: number
  seats: number
  meanTurns: number
  naturalEndRate: number
  agents: DuelAgent[]
}
interface DifficultyData {
  policy: string
  levels: { id: string; temperature: number; winRate: number; meanScore: number }[]
}
interface MultiData { tuned: Record<string, number>; from: Record<string, number> }

const { data: duel } = await useFetch<DuelData>('/data/duel.json', { server: false })
const { data: difficulty } = await useFetch<DifficultyData>('/data/difficulty.json', { server: false })
const { data: multi } = await useFetch<MultiData>('/data/tuned-weights-multi.json', { server: false })

const maxWin = computed(() => Math.max(1, ...(duel.value?.agents.map(a => a.winRate) ?? [1])))

/** Les cinq couleurs de la grille, pour rester dans l'univers visuel du jeu. */
const AGENT_COLORS = ['#5cc96e', '#5b9ff5', '#f5d742', '#f58a35', '#e85a82']

const STORIES: Record<string, string> = {
  colorExponent: "le solitaire disait « étale-toi », le multijoueur dit « finis tes couleurs » — parce que finir met fin à la partie",
  lateHorizon: "la phase couleurs démarre bien plus tôt",
  colorValueLate: "et elle compte beaucoup plus",
  jokerValue: "thésauriser est puni",
  orphan1: "les cases isolées redeviennent chères",
  extremeColumnEarly: "finir tôt les colonnes A et O : le signal le plus robuste du projet",
  cellValue: "couvrir du terrain vaut plus — c'est du tempo",
}

const weightStories = computed(() => {
  const m = multi.value
  if (!m) return []
  return Object.keys(STORIES)
    .filter(k => m.tuned[k] !== undefined)
    .map(k => ({
      key: k,
      solo: m.from[k] !== undefined ? m.from[k].toFixed(2) : '—',
      multi: m.tuned[k].toFixed(2),
      story: STORIES[k],
    }))
})

/** Mesure isolée : mêmes poids partout, seul le prix du déni change, 1600 parties. */
const denialRows = [
  { w: '0 (base)', score: '16,73', win: '19,7 %', delta: '—', best: false },
  { w: '0,6', score: '17,85', win: '23,8 %', delta: '+1,12 [0,67, 1,56]', best: false },
  { w: '0,8', score: '18,42', win: '26,9 %', delta: '+1,69 [1,24, 2,13]', best: true },
  { w: '1,1', score: '18,43', win: '29,6 %', delta: '+1,70 [1,23, 2,16]', best: true },
  { w: '1,6', score: '18,32', win: '27,1 %', delta: '+1,27 [0,81, 1,73]', best: false },
]
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
  color: #6e6e88;
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

.meta { @apply text-xs leading-relaxed; color: #6e6e88; max-width: 78ch; }

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
  color: #6e6e88;
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
.dim { color: #6e6e88; }
.good { color: #5cc96e; }
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

/* ── Barres de victoires ──────────────────────────────────────────────────── */

.bars {
  @apply flex flex-col gap-2.5 p-4 rounded-xl;
  background: #23232f;
  border: 1px solid #2e2e3e;
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
  min-width: 250px;
  background: #23232f;
  border: 1px solid #2e2e3e;
}

.flip__title {
  @apply text-xs font-bold uppercase tracking-wider;
  color: #6e6e88;
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
  color: #6e6e88;
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
  color: #6e6e88;
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
