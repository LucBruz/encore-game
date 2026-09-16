<template>
  <div class="ia-page">
    <header class="ia-header">
      <NuxtLink to="/" class="back">← Retour</NuxtLink>
      <h1>Agents & IA</h1>
      <p class="lede">
        D'une heuristique réglée à la main jusqu'à un réseau de neurones qui réfléchit avant
        de jouer — et surtout la mesure qui permet de dire lequel gagne, et de combien. Chaque
        chiffre est un écart apparié : à numéro de partie égal, les agents reçoivent les mêmes
        dés sur la même grille.
        <NuxtLink to="/solo" class="link">Jouer contre eux →</NuxtLink>
      </p>
    </header>

    <!-- ─── Classement ─────────────────────────────────────────────────── -->
    <section class="card">
      <h2>Le classement</h2>
      <p class="meta">
        Parties en tête-à-tête, sièges alternés, graines jamais utilisées pour régler ou
        entraîner les agents. Les égalités (2 à 5 % des parties) sont partagées.
        <strong>deni-0.8</strong> sert d'adversaire de référence : c'est la meilleure
        heuristique, et comme les réseaux, elle regarde ce qu'un coup laisse à l'adversaire.
      </p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>agent</th><th>principe</th><th>contre v3-multi</th><th>contre deni-0.8</th>
              <th>temps / coup</th><th>dans le jeu</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(a, i) in LADDER" :key="a.name" :class="{ 'row--best': i === 0 }">
              <td class="bot">{{ a.name }}</td>
              <td class="story">{{ a.idea }}</td>
              <td class="num" :class="a.vsV3 === '—' ? 'dim' : ''">{{ a.vsV3 }}</td>
              <td class="num strong">{{ a.vsDenial }}</td>
              <td class="num dim">{{ a.time }}</td>
              <td class="num" :class="a.inGame ? 'good' : 'dim'">{{ a.inGame ? 'oui' : 'pas encore' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bars">
        <div v-for="(a, i) in LADDER.filter(l => l.denialBar !== null)" :key="`b-${a.name}`" class="bar">
          <span class="bar__dot" :style="{ background: AGENT_COLORS[i % AGENT_COLORS.length] }" />
          <span class="bar__label">{{ a.name }}</span>
          <div class="bar__track">
            <div
              class="bar__fill"
              :style="{ width: `${a.denialBar}%`, background: AGENT_COLORS[i % AGENT_COLORS.length] }"
            />
          </div>
          <span class="bar__value">{{ a.denialBar!.toFixed(1).replace('.', ',') }} %</span>
        </div>
        <p class="bars__caption">victoires contre deni-0.8 en tête-à-tête — 50 % = jeu égal</p>
      </div>

      <p class="note">
        <strong>*</strong> Surestimé : la recherche simule son adversaire comme v3-multi, elle
        savait donc exactement comment celui-ci répondrait (voir plus bas).
        <br><br>
        Le jeu utilise aujourd'hui <strong>v3-multi</strong>, rendue plus ou moins faible par
        niveau de difficulté. Les trois premiers agents sont mesurés mais pas encore branchés :
        la recherche prend une demi-seconde par coup et devra tourner hors du fil principal
        pour ne pas figer l'interface.
      </p>
    </section>

    <!-- ─── La leçon du protocole ──────────────────────────────────────── -->
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
        <strong>premier / suivants</strong> qui récompensent la vitesse. Tout ce qui suit est
        mesuré là.
      </p>
    </section>

    <!-- ─── Poids appris ───────────────────────────────────────────────── -->
    <section v-if="weightStories.length" class="card">
      <h2>L'heuristique : ce que l'optimiseur a appris</h2>
      <p class="meta">
        v3 évalue une feuille avec des critères de joueur expérimenté, chacun pondéré selon
        l'avancement de la partie. Les poids sont optimisés par <strong>entropie
        croisée</strong> — échantillonner une gaussienne, garder les meilleurs, refitter sur
        eux. Sans gradient, robuste au bruit de mesure, contre un panel d'adversaires
        volontairement hétérogène.
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
      <h2>Les trois niveaux du jeu</h2>
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
        cible</strong>, mesuré en partie à 4 contre trois exemplaires du niveau maximal. Le
        plafond est ~25 %, quatre joueurs identiques se partageant les victoires.
        <br><br>
        Le softmax est préféré à l'ε-greedy, qui produit des <strong>bourdes</strong> :
        jouer parfaitement puis poser cinq croix n'importe où. Un joueur faible joue un
        coup correct mais pas le meilleur, ce que le softmax reproduit.
      </p>
    </section>

    <!-- ─── Réseau de neurones ─────────────────────────────────────────── -->
    <section class="card">
      <h2>Le réseau de neurones : cinq corrections</h2>
      <p class="meta">
        Un réseau de valeur : il note la feuille obtenue après chaque coup possible, et
        joue le mieux noté. 735 entrées creuses (cases cochées par couleur, étoiles, cases
        des adversaires) et 61 entrées calculées, écrites en TypeScript à un seul endroit ;
        Python n'entraîne que sur ces octets, le jeu et l'entraînement ne peuvent pas
        diverger. Un test vérifie que PyTorch et TypeScript calculent la même chose. Il a
        d'abord <strong>perdu</strong> — chaque étape corrige ce que la précédente a
        mesuré.
      </p>

      <ol class="steps">
        <li v-for="(s, i) in NET_STEPS" :key="i" class="step">
          <span class="step__n">{{ i + 1 }}</span>
          <div class="step__body">
            <div class="step__head">
              <strong>{{ s.title }}</strong>
              <span class="step__result" :class="s.good ? 'good' : 'bad'">{{ s.result }}</span>
            </div>
            <p>{{ s.text }}</p>
          </div>
        </li>
      </ol>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>mêmes positions, mêmes coups</th><th>suite jouée par</th><th>coup du réseau − coup de v3</th></tr>
          </thead>
          <tbody>
            <tr><td class="bot">parties du réseau</td><td>v3</td><td class="num">+0,10 [−0,10 ; +0,30]</td></tr>
            <tr class="row--bad"><td class="bot">parties du réseau</td><td>le réseau</td><td class="num">−0,55 [−0,81 ; −0,30]</td></tr>
          </tbody>
        </table>
      </div>

      <p class="note">
        Le diagnostic de l'étape 2, et la leçon la plus utile du projet. Ses coups étaient
        aussi bons que ceux de v3 <strong>si v3 jouait la suite</strong> — exactement ce que
        ses données d'entraînement mesuraient, puisque chaque simulation rendait la main à v3.
        Joués par lui-même, ils valaient moins. Il notait les positions pour un joueur
        meilleur que lui. Deux vérifications coup par coup, sous v3, étaient sorties nulles
        avant que celle-ci le montre.
        <br><br>
        Et la réserve de l'étape 5 : <strong>deni-0.8</strong>, une heuristique qui regarde
        elle aussi l'adversaire, bat v3-multi presque autant (63,6 %). L'essentiel du gain
        venait de l'objectif — jouer pour l'écart — plus que du réseau lui-même.
      </p>
    </section>

    <!-- ─── Déni de dés ────────────────────────────────────────────────── -->
    <section class="card">
      <h2>Le déni de dés</h2>
      <p class="meta">
        Joueur actif, un choix a deux effets : ce qu'il rapporte, et ce qu'il retire aux
        autres, qui n'auront que les 4 dés restants. Il faut pour ça énumérer les coups
        <strong>par paire de dés</strong> : la génération normale fusionne les paires
        équivalentes pour soi — dans plus de 8 tours sur 10 — et jette exactement
        l'information qui compte pour autrui.
      </p>

      <div class="duo">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>heuristique, 4 joueurs</th><th>victoires</th><th>écart apparié</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in DENIAL_HEURISTIC" :key="d.w" :class="{ 'row--best': d.best }">
                <td class="bot">prix {{ d.w }}</td>
                <td class="num">{{ d.win }}</td>
                <td class="num" :class="d.delta === '—' ? 'dim' : 'good'">{{ d.delta }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>réseau, tête-à-tête</th><th>vs v3-multi</th><th>écart apparié</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in DENIAL_NET" :key="d.w" :class="{ 'row--best': d.best }">
                <td class="bot">prix {{ d.w }}</td>
                <td class="num">{{ d.win }}</td>
                <td class="num" :class="d.delta === '—' ? 'dim' : 'good'">{{ d.delta }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p class="note">
        L'optimum est <strong>intérieur</strong> dans les deux cas : trop dénier nuit aussi.
        Pour le réseau, ce que les dés restants rapportent à l'adversaire est évalué par le
        même réseau depuis son siège, donc dans la même unité — et à 2 joueurs, un prix de 1
        est exactement la logique de l'écart : ce qu'il gagne, je le perds. Le gain diminue
        avec le nombre de joueurs (46,1 % par siège à 3 joueurs, 34,5 % à 4, contre 43,0 et
        33,5 sans déni).
        <br><br>
        <strong>Inutile une fois la recherche ajoutée</strong> : sur les mêmes 400 parties,
        l'écart est de −0,98 point [−2,29 ; +0,33]. La recherche simule déjà ce que
        l'adversaire fait des dés laissés ; ajouter le prix du déni le compte deux fois.
      </p>
    </section>

    <!-- ─── Recherche ──────────────────────────────────────────────────── -->
    <section class="card">
      <h2>Réfléchir avant de jouer : la recherche</h2>
      <p class="meta">
        Le jeu accepte jusqu'à 3 secondes par coup, le réseau en prend 1,6 ms. La recherche
        garde les 4 meilleurs coups selon le réseau, puis joue la suite de chacun
        <strong>16 fois, 4 tours plus loin</strong> — le réseau à sa place, v3-multi pour
        l'adversaire, la fin du tour en cours comprise — et laisse le réseau estimer l'écart
        final de la position atteinte. Les 4 coups voient les mêmes dés, sinon le hasard
        écraserait la différence.
      </p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>adversaire</th><th>table</th><th>victoires de la recherche</th><th>écart apparié</th><th>parties</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in SEARCH_RESULTS" :key="r.label" :class="{ 'row--caveat': r.caveat }">
              <td class="bot">{{ r.opponent }}</td>
              <td>{{ r.table }}</td>
              <td class="num" :class="r.caveat ? 'dim' : 'strong'">{{ r.win }}</td>
              <td class="num">{{ r.delta }}</td>
              <td class="num dim">{{ r.games }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="note">
        <strong>Le 84 % est surestimé.</strong> Dans ses simulations, la recherche suppose
        que l'adversaire joue comme v3-multi — et c'était justement l'adversaire de ce duel :
        elle savait exactement comment il répondrait. Les autres lignes sont contre des
        adversaires qu'elle ne modélise pas, et c'est elles qu'il faut retenir.
        <br><br>
        Temps mesuré : 0,55 s par coup en moyenne en tête-à-tête, 1,0 s au pire ; 0,7 s et
        1,4 s à 4 joueurs. Une recherche plus large (6 coups, 32 simulations, 6 tours)
        atteignait 4,9 s : trop lente.
      </p>
    </section>

    <!-- ─── Méthode ────────────────────────────────────────────────────── -->
    <section class="card">
      <h2>Méthode</h2>
      <ul class="method">
        <li><strong>Moteur headless</strong> — les règles vivent dans <code>engine/</code>, en données pures, sans Vue ni Pinia. L'interface, les agents et l'entraînement partagent la même implémentation : aucun agent n'est optimisé sur des règles différentes de celles auxquelles on joue.</li>
        <li><strong>Comparaisons appariées</strong> — à index de partie égal, tous les agents reçoivent la même graine, donc les mêmes dés sur la même grille. Le bruit est commun et s'annule dans les écarts, chacun reporté avec son intervalle à 95 %.</li>
        <li><strong>Graines réservées</strong> — les duels d'évaluation utilisent des graines que ni le réglage ni l'entraînement n'ont jamais vues, et les résultats sont confirmés sur un second bloc disjoint.</li>
        <li><strong>Données sur la politique qui joue</strong> — un coup est noté en simulant la suite avec l'agent qui la jouera vraiment ; noter pour un autre joueur a coûté 2,4 points par partie.</li>
        <li><strong>Toujours donner la taille de table</strong> — le même réseau gagnait à 4 joueurs et perdait en tête-à-tête : le nombre d'adversaires est une entrée du réseau.</li>
        <li><strong>Résultats négatifs conservés</strong> — l'expectimax profondeur 2 n'apportait rien pour 140× le coût, une heuristique à 21 paramètres faisait moins bien qu'à 6, et le déni n'ajoute rien à la recherche. Ce sont des mesures, pas des omissions.</li>
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

const { data: difficulty } = await useFetch<DifficultyData>('/data/difficulty.json', { server: false })
const { data: multi } = await useFetch<MultiData>('/data/tuned-weights-multi.json', { server: false })

/** Les cinq couleurs de la grille, pour rester dans l'univers visuel du jeu. */
const AGENT_COLORS = ['#5cc96e', '#5b9ff5', '#f5d742', '#f58a35', '#e85a82']

/**
 * Mesures figees (tete-a-tete, 2000 parties sauf mention, graines 5250000). Les
 * fichiers de resultats ont ete retires du site : les chiffres et leur protocole
 * sont consignes dans CLAUDE.md.
 */
const LADDER = [
  { name: 'recherche', idea: 'réseau + simulation de la suite de chaque coup', vsV3: '84,0 %*', vsDenial: '74,8 %', denialBar: 74.8, time: '~0,5 s', inGame: false },
  { name: 'réseau + déni', idea: 'réseau, moins ce que les dés laissés rapportent à l\'adversaire', vsV3: '73,4 %', vsDenial: '55,4 %', denialBar: 55.4, time: 'quelques ms', inGame: false },
  { name: 'réseau', idea: 'réseau de valeur, joue pour l\'écart', vsV3: '63,7 %', vsDenial: '49,3 %', denialBar: 49.3, time: '1,6 ms', inGame: false },
  { name: 'deni-0.8', idea: 'heuristique v3 + déni de dés', vsV3: '63,6 %', vsDenial: '—', denialBar: null, time: '1,2 ms', inGame: false },
  { name: 'v3-multi', idea: 'heuristique v3 réglée en partie à 4', vsV3: '—', vsDenial: '36,4 %', denialBar: 36.4, time: '0,18 ms', inGame: true },
]

const NET_STEPS = [
  {
    title: 'Prédire le score final',
    result: '−7,67 points',
    good: false,
    text: 'Entraîné sur l\'issue de parties simulées, il prédisait bien le score et jouait mal : il n\'avait jamais vu deux coups d\'une même position, et apprenait le prix d\'un joker en comparant des parties différentes.',
  },
  {
    title: 'Comparer les coups d\'une même position',
    result: '−2,42 points',
    good: false,
    text: 'Chaque candidat est joué 8 fois jusqu\'au bout avec les mêmes dés, par v3-multi, et le réseau apprend les écarts entre coups. Mieux, mais toujours battu — et le diagnostic ci-dessous montre pourquoi.',
  },
  {
    title: 'Le réseau joue lui-même la suite',
    result: '+0,7 point',
    good: true,
    text: 'Mêmes simulations, mais le réseau tient son siège jusqu\'à la fin : les données disent ce qu\'un coup vaut pour lui. Premier réseau devant v3-multi à une table de 4 — et pourtant 45 % en tête-à-tête.',
  },
  {
    title: 'Jouer pour l\'écart, pas pour ses points',
    result: '45 % → 58 %',
    good: true,
    text: 'Le réseau a deux sorties : son score, et son écart au meilleur adversaire. Mêmes poids, autre sortie jouée. Viser ses points fait un joueur lent qui se fait couper ; viser l\'écart le fait courir : il termine 62 % des parties au lieu de 31 %.',
  },
  {
    title: 'Des parties de 2 à 4 joueurs',
    result: '63,7 %',
    good: true,
    text: 'Toutes les données venaient de tables à 4, et le nombre d\'adversaires est une entrée du réseau : en tête-à-tête il extrapolait. Nouvelles données à 2, 3 et 4 joueurs : il bat v3-multi à toutes les tailles de table (43,0 % par siège à 3, 33,5 % à 4).',
  },
]

/** Heuristique v3-multi + deni, table de 4, 1600 parties : ecart apparie contre le meme agent sans deni. */
const DENIAL_HEURISTIC = [
  { w: '0', win: '19,7 %', delta: '—', best: false },
  { w: '0,6', win: '23,8 %', delta: '+1,12 [0,67 ; 1,56]', best: false },
  { w: '0,8', win: '26,9 %', delta: '+1,69 [1,24 ; 2,13]', best: true },
  { w: '1,1', win: '29,6 %', delta: '+1,70 [1,23 ; 2,16]', best: true },
  { w: '1,6', win: '27,1 %', delta: '+1,27 [0,81 ; 1,73]', best: false },
]

/** Reseau (tete marge) + deni, tete-a-tete contre v3-multi, 2000 parties. */
const DENIAL_NET = [
  { w: '0', win: '63,7 %', delta: '+3,24 [2,78 ; 3,70]', best: false },
  { w: '0,5', win: '71,5 %', delta: '+5,53 [5,08 ; 5,99]', best: false },
  { w: '1', win: '73,4 %', delta: '+6,00 [5,53 ; 6,46]', best: true },
  { w: '2', win: '66,6 %', delta: '+4,30 [3,82 ; 4,78]', best: false },
]

/** Recherche 4 coups x 16 simulations x 4 tours, adversaires simules par v3-multi. */
const SEARCH_RESULTS = [
  { label: 'deni', opponent: 'deni-0.8', table: '2 joueurs', win: '74,8 %', delta: '+7,18 [6,11 ; 8,25]', games: 400, caveat: false },
  { label: 'net-deni', opponent: 'réseau + déni', table: '2 joueurs', win: '61,8 %', delta: '+2,51 [1,46 ; 3,56]', games: 400, caveat: false },
  { label: 'v3', opponent: 'v3-multi', table: '2 joueurs', win: '84,0 %', delta: '+10,96 [9,87 ; 12,05]', games: 400, caveat: true },
]

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
