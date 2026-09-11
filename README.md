# Encore!

Implémentation multijoueur temps réel du jeu de dés *Encore!* (Inka & Markus Brand,
Schmidt Spiele), avec un moteur de règles headless et des agents de jeu mesurés.

**En ligne :** [encore.lucbruzzone.com](https://encore.lucbruzzone.com) ·
**Benchmark des agents :** [/ia](https://encore.lucbruzzone.com/ia) ·
**Jouer contre un bot :** [/solo](https://encore.lucbruzzone.com/solo)

Nuxt 4 · Vue 3 · Pinia · Supabase Realtime · Tailwind · Vitest

---

## Ce que contient le dépôt

| Dossier | Rôle |
|---|---|
| `app/` | Application Nuxt : pages, composants, stores Pinia, synchronisation temps réel |
| `engine/` | Moteur de règles headless — données pures, zéro Vue/Pinia |
| `bots/` | Agents de jeu et fonctions d'évaluation, au-dessus du moteur |
| `scripts/` | Harnais d'évaluation, optimisation des poids, benchmark de perf |

Le moteur vit à la racine et non sous `app/` pour une raison précise : les agents et les
scripts d'optimisation doivent pouvoir jouer des dizaines de milliers de parties sans
charger le moindre runtime Nuxt. L'interface et les agents partagent ainsi **une seule**
implémentation des règles, donc un agent ne peut pas être optimisé sur des règles
différentes de celles auxquelles les joueurs jouent.

## Commandes

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # suite vitest (moteur, store, agents, intégration bot/store)
pnpm eval         # benchmark des agents      -> public/data/eval.json
pnpm tune         # optimisation CEM des poids -> public/data/tuned-weights.json
pnpm tune:v3      # optimisation en solitaire (conservee comme temoin)
pnpm tune:multi   # optimisation en partie a 4 -> public/data/tuned-weights-multi.json
pnpm duel         # tournoi multijoueur        -> public/data/duel.json
pnpm calibrate    # calibration des 3 niveaux  -> public/data/difficulty.json
pnpm bench        # chronométrage de l'énumérateur de placements
```

Variables d'environnement requises pour le multijoueur : `SUPABASE_URL`, `SUPABASE_KEY`.
Le mode `/solo` fonctionne sans.

---

## Un bug de règle, trouvé en lisant la version originale

Le code n'autorisait un départ dans la colonne H que pour le tout premier coup d'un
joueur. La règle officielle allemande (Schmidt Spiele, section `DABEI GELTEN FOLGENDE
REGELN`) énonce **deux puces distinctes** :

> • Der allererste Wurf eines Spielers muss immer in der Startspalte H gesetzt werden.
> • Kreuze dürfen nur waagerecht oder senkrecht benachbart zu mindestens einem bereits
>   angekreuzten Kästchen **oder in der Startspalte beginnend** gesetzt werden.

La première puce couvre déjà entièrement le premier jet. Le disjonct de la seconde serait
donc du texte mort s'il ne valait pas en permanence : **la colonne H est une ancre
permanente**, on peut y ouvrir un nouveau groupe à tout moment. Les versions française et
anglaise officielles disent la même chose, et le barème le corrobore — H vaut 1/0 point,
le minimum unique du gradient 5-3-3-3-2-2-2-**1**-2-2-2-3-3-3-5, ce qui ne s'explique que
si c'est systématiquement la colonne la plus facile à remplir.

Conséquence sur le code : le drapeau `isFirstMove` disparaît. Avec un prédicat d'ancrage
unique `toucheUneCroix || estEnColonneH`, un masque vide rend le premier terme faux
partout, et le prédicat se réduit exactement à la règle du premier coup. Une seule
fonction à avoir juste au lieu de trois.

## Moteur

`legalPlacements` énumère les sous-ensembles connexes par **ESU** (Wernicke) : chaque
placement est produit exactement une fois, enraciné sur son sommet d'indice minimum. Pas
de génération suivie de déduplication, et la contrainte « toutes les croix dans un seul
bloc de couleur » devient implicite — la connexité dans le graphe des cases non cochées de
la couleur implique déjà un bloc unique.

L'espace de recherche est borné au préalable : tout groupe valide est connexe et contient
une ancre, donc chacune de ses cases est à distance ≤ `count−1` d'une ancre.

Les règles sont testées contre une **référence par force brute** appliquant les trois
prédicats séparément (taille, contiguïté mutuelle, ancrage), sur des positions aléatoires
où le binomial reste calculable.

## Le protocole avant les chiffres

Les agents ont d'abord ete optimises **en solitaire** : une feuille, pas d'adversaire, une
limite de 50 tours comme garde-fou. C'etait faux, et pas qu'un peu — le classement obtenu
est inverse au sommet.

| agent | solitaire, 50 tours | table de 4 joueurs |
|---|---|---|
| le mieux note en solitaire | **38,88**, 1er | **15,11**, **dernier**, 3,8 % de victoires |
| le meme, prive du droit de passer | ~36 | 20,73, 27,2 % de victoires |

Le solitaire ne punit pas la temporisation : l'agent y decide seul quand la partie
s'arrete. Il avait donc appris a thesauriser ses 8 jokers (+8 points garantis) et a passer
12 fois par partie. A une vraie table, les autres finissent a sa place.

Trois choses n'existent que dans `bots/playMulti.ts` :

- **le deni de des** — le joueur actif met sa paire de cote, les passifs n'ont que les 4 restants
- **la fin decidee par autrui** — le premier a completer deux couleurs coupe tout le monde
- **les bonus premier / suivants** — qui recompensent la vitesse

Tout ce qui suit est donc mesure a une table de 4.

## Agents et mesure

Toutes les comparaisons sont **appariées** : à index de partie égal, chaque agent reçoit
la même graine, donc la même suite de dés sur la même grille. Le harnais reporte l'écart
apparié avec son intervalle à 95 %, parce qu'une différence de moyennes ne veut rien dire
sans savoir de combien elle fluctue.

2000 parties, tables de 4 tirees parmi 5 agents, rotation des sieges, 8 grilles :

| agent | score moyen | victoires | a termine | écart apparié |
|---|---|---|---|---|
| **`v3-multi`** | **26,58** | **73,0 %** | 74,8 % | référence |
| `v3-sans-passe` | 20,73 | 27,2 % | 28,3 % | −7,45 [−8,04, −6,87] |
| `v3-joker-1.5` | 16,93 | 10,9 % | 11,1 % | −10,66 [−11,17, −10,15] |
| `greedy-cem` | 16,81 | 10,1 % | 7,6 % | −10,75 [−11,26, −10,24] |
| `v3-thesauriseur` (meilleur en solitaire) | 15,11 | 3,8 % | 2,5 % | −12,87 [−13,35, −12,39] |

Le vainqueur est aussi celui qui **termine** les parties : 74,8 % contre 2,5 % pour le
thesauriseur. Aller vite est une strategie, pas un effet de bord.

Les poids sont optimises par **entropie croisee**, avec pour cible la marge contre le
meilleur adversaire de la table, et valides sur un jeu de graines disjoint. Le panel
d'adversaires est volontairement heterogene : s'entrainer contre un seul style apprendrait
a battre ce style, pas a jouer.

Le passage du solitaire au multijoueur inverse plusieurs poids, et chaque inversion se lit
comme une regle de jeu :

| poids | solitaire | multijoueur | ce que ça dit |
|---|---|---|---|
| `colorExponent` | 0,46 | **1,88** | le solitaire disait « etale-toi », le multijoueur dit « finis tes couleurs » — parce que finir met fin a la partie |
| `lateHorizon` | 33,1 | **24,3** | la phase couleurs demarre bien plus tot |
| `jokerValue` | 6,40 | **3,60** | thesauriser est puni |
| `orphan1` | 0,39 | **2,25** | les cases isolees redeviennent cheres |
| `extremeColumnEarly` | 5,65 | **8,84** | finir tot les colonnes A et O : le signal le plus robuste du projet |

### Ce qui a fini par marcher : des features dictées par un joueur

La v2 avait ajouté des compteurs **plats** (taille de frontière, couleurs encore
accessibles) et avait échoué. La v3 part de ce que dit un joueur expérimenté, et surtout
**date chaque terme par le numéro de tour** — c'est la différence qui compte :

| conseil du joueur | poids appris | verdict |
|---|---|---|
| finir tôt les colonnes extrêmes | 1 → **4,51**, phase « tôt » jusqu'au tour 16 | largement confirmé, j'avais sous-estimé ×4,5 |
| garder ses jokers | 3,68 → **5,00** | confirmé, la réticence doit être plus forte encore |
| jouer les couleurs après développement | bascule au tour 25 → **31,7** | direction confirmée, ampleur plus faible |
| ouvrir des possibilités tôt | 0,3 → **0,18** | confirmé mais modeste — et ne survit **que** daté par le tour |
| éviter de laisser des cases isolées | isolées 1,5 → **0,25**, mais paires 0,4 → **0,76** | **inversé** |

Le dernier point est le plus intéressant : l'optimiseur a presque annulé la pénalité sur
les cases isolées et triplé celle sur les **paires**. Lecture plausible, à prendre comme
hypothèse : une case seule se coche avec un « 1 », face courante ; une paire est un piège
double, parce que la casser avec un « 1 » *fabrique* une case isolée.

Validation appariée sur 2000 parties de graines disjointes : **+0,72 [+0,50, +0,95]** contre
`greedy-cem`, pour ×2 le coût. À comparer aux +1,60 du Monte-Carlo pour ×3 500. L'effet se
lit aussi dans le jeu : passes par partie 2,68 → 1,98, parties terminées 95,4 % → 97,9 %.

### Trois niveaux de difficulté, calibrés

Une seule politique, un seul bouton : température softmax sur les valeurs z-scorées à
chaque décision, puis **dichotomie sur un score cible**.

Mesure faite en partie a 4 contre trois exemplaires du niveau maximal. La cible est un
**taux de victoire** et non un score : a une table de 4, un score absolu depend autant des
adversaires que de l'agent. Le plafond est ~25 %, quatre joueurs identiques se partageant
les victoires.

| niveau | température | victoires | score moyen |
|---|---|---|---|
| facile | 0,378 | 6,8 % | 11,3 |
| moyen | 0,179 | 21,0 % | 16,8 |
| difficile | 0 | 27,4 % | 18,6 |

L'alternative naïve — prendre `random`, `greedy` et `greedy-cem` comme les trois niveaux —
ne marche pas : `random` est à **7 écarts-types** sous `greedy` (absurde, pas facile), et
`greedy` n'est qu'à **1 écart-type** de `greedy-cem` (indistinguable sur une partie). Une
échelle faite d'artefacts historiques est mal espacée par accident.

Le softmax est préféré à l'ε-greedy parce que ce dernier produit des **bourdes** : jouer
parfaitement puis poser cinq croix n'importe où. Un joueur faible joue un coup correct mais
pas le meilleur, ce que le softmax reproduit.

### Résultats négatifs, conservés

- **Expectimax profondeur 2** : +0,28 [−0,26, +0,82] — indistinguable du bruit, pour ~140×
  le coût. Les dés sont entièrement relancés chaque tour : anticiper un lancer n'apporte
  rien que l'évaluation de position ne capture déjà.
- **Heuristique à 21 paramètres** (taille de frontière, couleurs encore accessibles, tables
  de valeur libres) : −0,56. La représentation enrichie n'aide pas.
- **Déroulements Monte-Carlo** avec la politique optimisée (192 déroulements par décision) :
  la seule chose qui la batte réellement, de **+1,60 [+0,30, +2,90]** sur 64 parties
  appariées — significatif, mais pour ~3 500× son coût et un intervalle large.

Ces deux premières sondes testent au fond la même hypothèse — « modéliser explicitement la
flexibilité future aide-t-il ? ». Ce sont donc deux résultats négatifs *corrélés*, pas deux
confirmations indépendantes.

Ces resultats negatifs ont tous ete mesures **en solitaire**, donc dans le cadrage dont on
sait maintenant qu'il classe mal. Ils restent valables comme constats sur ce cadrage, pas
comme verdicts sur le jeu ; les reverifier a une table de 4 reste a faire.

La lecon principale du projet n'est pas un chiffre : **le protocole de mesure comptait plus
que l'algorithme**. Le meilleur agent selon le premier protocole est le pire selon le
second, et aucun reglage n'aurait rattrape ca.

## Licence

*Encore!* est une création d'Inka et Markus Brand éditée par Schmidt Spiele. Ce dépôt est
une implémentation personnelle non officielle, sans affiliation ni but commercial.
