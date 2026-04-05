# Plan — Bugfixes UI/Multijoueur (4 bugs)

## Phase 0 — Analyse des sources (déjà complétée)

### Sources consultées
| Fichier | Rôle |
|---|---|
| `app/components/game/GameDices.vue` | Affichage + logique dés, badge phase, bouton passer |
| `app/pages/game/[id].vue` | Orchestration timers, watchers phase, onglets joueurs |
| `app/stores/gameStore.ts` | `rollDicesWithResult`, `passActiveTurn`, `availableForPassive` |
| `app/composables/Usegamesync.ts` | `dispatch`, `applyToStore`, `PASS_ACTIVE` guard |
| `app/composables/Useturntimer.ts` | `start(duration, onExpire)` |

### APIs confirmées
- `store.isFirstThreeTurns` — getter, vrai quand `turnNumber < 3`
- `store.phase` — `'waiting_roll' | 'active_selecting' | 'passive_selecting' | 'turn_end'`
- `store.activePlayerId` — id du joueur actif courant
- `store.currentRoll.colorDices` / `.numberDices` — tableaux de 3
- `store.availableForPassive` — retourne les dés restants (tous si `activeSelection === null`)
- `timer.start(duration, onExpire)` / `timer.stop()`
- `sync.dispatch(type, payload)` — applique localement + broadcast + persiste

---

## Bug 1 — Premiers tours : tout le monde voit le bouton lancer immédiatement

### Diagnostic
Pendant les tours 0–2, tous les joueurs partagent les mêmes dés (ils jouent en simultané).
Attendre que le joueur actif lance pour afficher le bouton aux autres est donc inutile.
Or le composant affiche uniquement le bouton si `isActivePlayer`, et montre un message d'attente aux autres.

### Fichier à modifier
`app/components/game/GameDices.vue`

### Changement exact

**Avant (ligne ~6–18) :**
```html
<div v-if="store.phase === 'waiting_roll'" class="dices-panel__intro">
  <button
    v-if="isActivePlayer"
    class="btn-roll"
    ...
  >
  <p v-else class="dices-panel__waiting">
    En attente du lancer de <strong>{{ activePlayerName }}</strong>...
  </p>
</div>
```

**Après :**
```html
<div v-if="store.phase === 'waiting_roll'" class="dices-panel__intro">
  <button
    v-if="isActivePlayer || store.isFirstThreeTurns"
    class="btn-roll"
    ...
  >
  <p v-else class="dices-panel__waiting">
    En attente du lancer de <strong>{{ activePlayerName }}</strong>...
  </p>
</div>
```

**Mécanique "premier arrivé, premier servi" :**
Le guard dans `rollDicesWithResult` : `if (this.phase !== 'waiting_roll') return`
garantit que si deux joueurs cliquent en même temps, le second broadcast est ignoré
(phase déjà `passive_selecting`). ✓

### Vérification
- [ ] Aux tours 1–3 : tous les joueurs voient le bouton "Lancer" sans attendre
- [ ] Si deux joueurs cliquent en même temps → un seul résultat est appliqué (guard phase)
- [ ] Les deux joueurs voient les mêmes dés après le lancer

---

## Bug 2 — Supprimer les switches de vue automatiques + afficher les dés à la place du message d'attente

### Diagnostic
Deux sous-problèmes distincts :

**Sous-problème A — Switches automatiques de vue dans `[id].vue` :**
Trois endroits changent `currentViewPlayer` sans action du joueur :
- Watcher `turn_end` (ligne ~291) : `currentViewPlayer.value = store.activePlayerId`
- `handlePass()` (ligne ~306) : `currentViewPlayer.value = sync.localPlayerId.value`
- `handleNextTurn()` (ligne ~315) : `currentViewPlayer.value = store.activePlayerId`

Ces switchs automatiques perturbent le joueur qui serait en train de regarder son plateau.
Le switch manuel (onglets) est voulu et reste en place car le readonly est déjà géré.

**Sous-problème B — Message d'attente dans `GameDices.vue` :**
Quand la phase est `active_selecting` et le joueur n'est pas actif, il voit `"⏳ En attente que X choisisse ses dés..."` au lieu des dés.

### Fichier 1 : `app/pages/game/[id].vue`

**Supprimer les 3 assignments automatiques de `currentViewPlayer` :**

```js
// Watcher turn_end — supprimer cette ligne :
currentViewPlayer.value = store.activePlayerId  // ligne ~291

// handlePass() — supprimer cette ligne :
currentViewPlayer.value = sync.localPlayerId.value  // ligne ~306

// handleNextTurn() — supprimer cette ligne :
currentViewPlayer.value = store.activePlayerId  // ligne ~315
```

L'initialisation dans `onMounted` (`currentViewPlayer.value = lobby.localPlayerId`) est conservée. ✓

### Fichier 2 : `app/components/game/GameDices.vue`

**Remplacer le message d'attente par les dés du joueur actif (read-only) :**

Avant (ligne ~163–167) :
```html
<div v-else-if="!isActivePlayer && store.phase === 'active_selecting'" class="dices-panel__waiting-active">
  <p>⏳ En attente que <strong>{{ activePlayerName }}</strong> choisisse ses dés...</p>
</div>
```

Après :
```html
<div v-else-if="!isActivePlayer && store.phase === 'active_selecting' && store.currentRoll" class="dices-display-readonly">
  <div class="dices-group">
    <span class="dices-group__label">Couleur</span>
    <div class="dices-row">
      <GameDice
        v-for="(dice, i) in store.currentRoll.colorDices"
        :key="`c-ro-${i}`"
        type="color"
        :value="dice.value"
        :selectable="false"
      />
    </div>
  </div>
  <div class="dices-group">
    <span class="dices-group__label">Chiffre</span>
    <div class="dices-row">
      <GameDice
        v-for="(dice, i) in store.currentRoll.numberDices"
        :key="`n-ro-${i}`"
        type="number"
        :value="dice.value"
        :selectable="false"
      />
    </div>
  </div>
</div>
```

Ajouter en CSS :
```css
.dices-display-readonly {
  @apply flex flex-col gap-4 opacity-60;
}
```

### Vérification
- [ ] Passer son tour ne change plus la vue automatiquement
- [ ] Fin de tour (`turn_end`) ne switche plus vers le joueur actif suivant
- [ ] `handleNextTurn` ne switche plus la vue
- [ ] Le switch manuel via les onglets fonctionne toujours
- [ ] Pendant `active_selecting`, le joueur passif voit les 6 dés en read-only
- [ ] Plus de message "En attente que X choisisse ses dés"

---

## Bug 3 — Espacements UI : badge trop collé + btn-pass trop collé

### Diagnostic
Dans `GameDices.vue`, le conteneur `.dices-panel` utilise `gap-4`. Visuellement :
- Le badge (`.dices-panel__label`) est trop proche du label "COULEUR" (`.dices-group__label`)
- Le `.btn-pass` est trop collé à la dernière ligne de dés

### Fichier à modifier
`app/components/game/GameDices.vue`

**Changement 1 — ajouter `mb-2` au label de phase :**
```css
/* Avant */
.dices-panel__label { }

/* Après */
.dices-panel__label {
  @apply mb-2;
}
```

**Changement 2 — ajouter `mt-2` au btn-pass :**
```css
/* Avant */
.btn-pass {
  @apply text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all self-start;
  ...
}

/* Après */
.btn-pass {
  @apply text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all self-start mt-2;
  ...
}
```

### Vérification
- [ ] Espace visible entre le badge "Tu es le joueur actif" et le label "COULEUR"
- [ ] Espace visible entre le dernier dé tiré et le bouton "Passer mon tour"

---

## Bug 4 — Timer expire : seul le joueur actif passe, les passifs gardent leur temps

### Diagnostic
Dans `[id].vue`, la callback `onExpire` du timer fait :
1. `PASS_ACTIVE` pour le joueur actif ✓ (correct)
2. `PASS_PASSIVE` pour **tous** les joueurs passifs ✗ (incorrect — ils n'ont pas encore joué !)

Après `PASS_ACTIVE`, la phase passe à `passive_selecting`. Or le watcher de phase ne déclenche `startTimer()` que si `isFirstThreeTurns`. Résultat : les passifs se retrouvent passés sans avoir pu choisir.

**Le getter `availableForPassive` retourne déjà les 3 dés quand `activeSelection === null`** (ce qui est le cas après PASS_ACTIVE). ✓

### Fichier à modifier
`app/pages/game/[id].vue`

**Changement 1 — fonction `startTimer` (callback onExpire) :**

Avant :
```js
function startTimer() {
  timer.start(lobby.turnDuration, () => {
    if (sync.localPlayerId.value !== store.activePlayerId) return

    if (store.isFirstThreeTurns) {
      store.players
        .filter(p => !p.hasPlaced && !p.hasPassed)
        .forEach(p => sync.dispatch('PASS_PASSIVE', { playerId: p.id }))
    } else {
      const ap = store.players.find(p => p.id === store.activePlayerId)
      if ((store.phase as string) === 'active_selecting' && ap && !ap.hasConfirmed) {
        sync.dispatch('PASS_ACTIVE', {})
      }
      store.players
        .filter(p => p.id !== store.activePlayerId && !p.hasPlaced && !p.hasPassed)
        .forEach(p => sync.dispatch('PASS_PASSIVE', { playerId: p.id }))
    }
  })
}
```

Après :
```js
function startTimer() {
  timer.start(lobby.turnDuration, () => {
    if (sync.localPlayerId.value !== store.activePlayerId) return

    if (store.isFirstThreeTurns) {
      // Tours 1–3 : passer tous ceux qui n'ont pas joué
      store.players
        .filter(p => !p.hasPlaced && !p.hasPassed)
        .forEach(p => sync.dispatch('PASS_PASSIVE', { playerId: p.id }))
    } else if ((store.phase as string) === 'active_selecting') {
      // Seulement passer le joueur actif — les passifs jouent ensuite
      const ap = store.players.find(p => p.id === store.activePlayerId)
      if (ap && !ap.hasConfirmed) {
        sync.dispatch('PASS_ACTIVE', {})
      }
      // NE PAS passer les joueurs passifs ici — ils auront leur propre timer
    } else if ((store.phase as string) === 'passive_selecting') {
      // Timer passif expiré : passer tous ceux qui n'ont pas encore joué
      store.players
        .filter(p => p.id !== store.activePlayerId && !p.hasPlaced && !p.hasPassed)
        .forEach(p => sync.dispatch('PASS_PASSIVE', { playerId: p.id }))
    }
  })
}
```

**Changement 2 — watcher de phase : démarrer le timer passif quand actif a passé :**

Avant :
```js
if (phase === 'passive_selecting' && store.isFirstThreeTurns) {
  startTimer()
}
```

Après :
```js
if (phase === 'passive_selecting') {
  // Tours 1–3 ET tours normaux où le joueur actif a passé son tour
  const activePlayerPassed = store.players.find(p => p.id === store.activePlayerId)?.hasPassed ?? false
  if (store.isFirstThreeTurns || activePlayerPassed) {
    startTimer()
  }
}
```

### Vérification
- [ ] Quand le timer expire en `active_selecting` → seul le joueur actif passe
- [ ] La phase passe à `passive_selecting` → un nouveau timer démarre pour les passifs
- [ ] Les joueurs passifs voient les 3 dés disponibles (activeSelection === null → availableForPassive retourne tout)
- [ ] Quand le timer passif expire → seuls les passifs non-joués sont passés
- [ ] Si le joueur actif passe manuellement (bouton) → même comportement que l'expiration timer

---

## Phase Finale — Vérification globale

- [ ] Test tour 1 : tous les joueurs voient le bouton lancer, obtiennent les mêmes dés
- [ ] Test tour normal : onglets affichent les scores mais ne switchent pas le plateau
- [ ] Test timer : joueur actif ne répond pas → passe → passifs jouent leurs X secondes avec 3 dés
- [ ] Espacements visuels corrects dans le panneau dés
- [ ] Aucune régression sur le flow normal (active_selecting → confirm → passive_selecting → placer)

---

## Bug 5 — Grilles : rendu incorrect malgré des données correctes

### Diagnostic
**Les fichiers `app/data/grids/grid-XX.ts` sont corrects et ne doivent PAS être modifiés.**

Exemple confirmé : row 0 de `grid-01`, index 10 = `['b', false]` (bleu, sans étoile) dans les données,
mais le navigateur affiche cette case en **jaune avec étoile** (`y, true`).

Le bug est dans le **pipeline de rendu**, pas dans les données.

### Cause probable
`GRID_01_CELLS` est un tableau de tuples `[ColorKey, boolean][]` défini comme constante module-level.
Quand Pinia initialise l'état `grid: GRID_01`, Vue 3 rend ce tableau **profondément réactif** via `reactive()`.
La réactivité profonde wrape chaque élément (chaque tuple) dans un Proxy.

Dans `GameGrid.vue`, le template accède à `cell[0]` et `cell[1]` via index sur ces Proxies.
Ce pattern peut être problématique si Vue 3 traite les tuples TypeScript différemment des tableaux simples,
ou si un index réactif ne retourne pas la bonne valeur dans certains contextes.

### Fichier à modifier
`app/stores/gameStore.ts` — dans l'action `initGrid` et l'état initial, s'assurer que les cellules
ne sont **pas réactivement mutées** en fournissant une copie superficielle du tableau cells.

`app/components/game/GameGrid.vue` — remplacer l'accès par index sur le tuple par une **déstructuration explicite**.

### Changements exacts

**Changement 1 — `GameGrid.vue` : déstructurer `cell` au lieu d'accéder par index**

Avant :
```html
<GameCell
  v-for="(cell, idx) in grid.cells"
  :key="idx"
  :color="COLOR_MAP[cell[0]].name"
  :star="cell[1]"
```

Après :
```html
<GameCell
  v-for="([colorKey, hasStar], idx) in grid.cells"
  :key="idx"
  :color="COLOR_MAP[colorKey].name"
  :star="hasStar"
```

**Changement 2 — `gameStore.ts` : isoler les cells de la réactivité profonde**

Dans `initGrid`, passer une copie des cells pour éviter que Pinia proxy-ife le tableau constant :
```js
initGrid(gridId: string) {
    const grid = GRID_MAP[gridId as GridId]
    if (grid) this.grid = { ...grid, cells: [...grid.cells] }
},
```

Même chose pour l'état initial — remplacer :
```js
state: () => ({
    grid: GRID_01,
```
Par :
```js
state: () => ({
    grid: { ...GRID_01, cells: [...GRID_01.cells] },
```

### Vérification
- [ ] Row 0 de grid-01, index 10 affiche bleu sans étoile (était jaune+étoile)
- [ ] Toutes les cases de la grille affichent la bonne couleur et le bon état étoile
- [ ] La grille 02 affiche correctement ses couleurs
- [ ] Aucune régression sur les interactions (clic, placement, validation)
