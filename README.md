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

## Agents et mesure

Toutes les comparaisons sont **appariées** : à index de partie égal, chaque agent reçoit
la même graine, donc la même suite de dés sur la même grille. Le harnais reporte l'écart
apparié avec son intervalle à 95 %, parce qu'une différence de moyennes ne veut rien dire
sans savoir de combien elle fluctue.

2000 parties par agent, 8 grilles officielles, mode de bonus `average` :

| agent | score moyen | écart apparié vs `greedy-cem` |
|---|---|---|
| `random` | 0,86 | −35,05 [−35,39, −34,71] |
| `greedy` (poids à la main) | 31,52 | −4,39 [−4,63, −4,15] |
| **`greedy-cem`** (poids optimisés) | **35,91** | référence |
| `greedy-v2` (21 paramètres) | 35,36 | −0,56 [−0,78, −0,33] |

L'optimisation par **entropie croisée** vaut +4,39 points, validés sur un jeu de graines
disjoint de celui d'optimisation. Deux poids appris sont instructifs : un joker vaut
beaucoup plus que le point qu'il rapporte en fin de partie, et l'exposant de progression
des couleurs devient **sous-linéaire** — mieux vaut étaler ses croix que finir une
couleur. C'est exactement le conseil du livret (« Plus vous dispersez vos croix, plus vos
possibilités de choix augmentent »), retrouvé seul par l'optimiseur. L'effet se lit dans
les passes par partie, qui tombent de 5,77 à 2,68.

### Résultats négatifs, conservés

- **Expectimax profondeur 2** : +0,28 [−0,26, +0,82] — indistinguable du bruit, pour ~140×
  le coût. Les dés sont entièrement relancés chaque tour : anticiper un lancer n'apporte
  rien que l'évaluation de position ne capture déjà.
- **Heuristique à 21 paramètres** (taille de frontière, couleurs encore accessibles, tables
  de valeur libres) : −0,56. La représentation enrichie n'aide pas.
- **Déroulements Monte-Carlo** avec la politique optimisée : la seule chose qui la batte
  réellement, d'environ +1 point, pour ~3 700× son coût.

Ces deux premières sondes testent au fond la même hypothèse — « modéliser explicitement la
flexibilité future aide-t-il ? ». Ce sont donc deux résultats négatifs *corrélés*, pas deux
confirmations indépendantes.

La conclusion tenable est que ce jeu est saturé par une heuristique de position à quelques
paramètres, et que la recherche n'y achète qu'une marge étroite à un coût disproportionné.

## Licence

*Encore!* est une création d'Inka et Markus Brand éditée par Schmidt Spiele. Ce dépôt est
une implémentation personnelle non officielle, sans affiliation ni but commercial.
