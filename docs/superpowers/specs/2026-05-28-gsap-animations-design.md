# Spec — Animations GSAP Encore-Game

> Généré le 2026-05-28 depuis le bundle de design `encore-game-high` (5 scènes GSAP).

---

## Contexte

L'utilisateur a prototypé 5 scènes d'animation GSAP dans un outil de design (HTML/CSS/React). Le bundle exporté contient :
- `chats/chat1.md` — transcript des décisions
- `project/Encore - Animations.html` — prototype complet
- `project/animations.jsx` — code de chaque scène
- `project/tweaks-panel.jsx` — panneau de contrôle (hors scope production)

Les animations à implémenter dans le projet Nuxt 4 / Vue 3 :

| # | Scène | Déclencheur dans l'app |
|---|-------|------------------------|
| 1 | Loader | `/` au chargement · `/game/[id]` pendant `sync.setup()` |
| 2 | Lancement | `/game/[id]` première fois (pas reconnexion) |
| 3 | Complétion couleur | `game/[id]` quand `store.lastColorCompleted` change |
| 4 | Fin de partie | `game/[id]` quand `store.gameOver` passe à `true` |
| 5 | Lancer de dés (Spin 3D) | `GameDices.vue` → `GameDice.vue` au moment du lancer |

---

## Décisions de design (depuis le chat)

- **Loader** : lettres "ENCORE!" tombent une par une + "!" qui rebondit + anneaux rotatifs SVG + particules colorées + barre de progression.
- **Lancement** : carte lobby s'envole vers le haut (scale 0.85, opacity 0), flash radial, dés tombent avec rotation aléatoire, grille se construit cellule par cellule depuis les bords.
- **Complétion** : suppression du pulse case par case (trop agressif). Les autres couleurs s'estompent (opacity 0.22), ruban "COMPLÉTÉ" apparaît, jeton +5 vole vers le score, compteur s'incrémente.
- **Fin de partie** : trophée scale+wiggle, confettis, nom du gagnant, scores comptant vers le haut, barres de progression, CTA "Rejouer".
- **Dés 3D** : cubes CSS 3D noirs 6 faces, pips traditionnels sur dés chiffres, pastilles colorées sur dés couleur. Seul le style **Spin** est conservé (rotation longue puis atterrissage sur la bonne face). Les 4 autres styles sont supprimés. GameDice.vue devient définitivement ce cube 3D.

---

## Architecture

### Dépendances

```
pnpm add gsap
```

GSAP est importé uniquement côté client (`import gsap from 'gsap'` dans les composants — les animations sont dans `onMounted` ou `watch` avec guards `process.client`).

### Arborescence créée

```
app/components/animations/
  LoaderScreen.vue
  LaunchOverlay.vue
  ColorCompletionOverlay.vue
  EndGameOverlay.vue
```

### Signal pour la complétion couleur

`gameStore.ts` reçoit un nouveau champ d'état :

```ts
lastColorCompleted: null as { playerId: string; color: ColorKey } | null
```

Set dans `checkColorCompletion()` quand `player.colorBonus[c]` passe de `null` à `'first'` ou `'others'`. Remis à `null` par l'overlay après l'animation via `store.clearLastColorCompleted()`.

### Signal pour le lancement (vs reconnexion)

`lobbyStore.ts` reçoit `justStartedGame: boolean`. Mis à `true` quand `game.status` passe à `'playing'` dans `watchLobby`. Consommé et remis à `false` dans `game/[id].vue` après l'overlay de lancement.

---

## Composants — Spécifications détaillées

### LoaderScreen.vue

**Props :** `subtitle?: string` (défaut : `'chargement de la partie...'`), `duration?: number` (défaut : `2000` ms)

**Emits :** `done`

**Comportement :**
- Overlay fixe plein écran `z-index: 200`, fond `#0f0f13`, grain CSS (SVG fractal opacity 0.05)
- 3 anneaux SVG rotatifs concentriques (88/64/44px radius, stroke jaune/orange fané)
- 40 pastilles colorées positionnées aléatoirement en arrière-plan (couleurs : g/y/b/p/o)
- Titre "ENCORE!" en Space Mono 104px dégradé jaune→orange
- "!" séparé qui rebondit 3 fois en fin d'apparition
- Sous-titre fade-in
- Barre de progression qui se remplit sur `duration`
- Emit `done` quand la barre est pleine + délai 200ms

**Animation GSAP (fidèle au prototype) :**
```
t=0    : anneau scale 0→1, particules pop
t=0.25 : lettres tombent une par une (stagger 70ms, y: -180→0, rotate -25→0, opacity 0→1)
t=0.9  : "!" apparaît + rebondit 3 fois
t=1.0  : sous-titre fade-in
t=1.1  : barre de progression se remplit (1.6s power2.inOut)
```

---

### LaunchOverlay.vue

**Props :** `playerName: string`, `gridId?: string`

**Emits :** `done`

**Comportement :**
- Overlay plein écran (z-index 100, fond `#0f0f13`)
- Montre une réplique statique de la carte lobby (Créer une partie, nom du joueur, choix de grille)
- Joue l'animation puis émet `done`

**Animation GSAP :**
```
t=0.1  : carte lobby scale 0.85 + y -80 + opacity 0 (power3.in, 0.6s)
t=0.6  : flash radial (opacity 0→0.85→0, 0.08s + 0.45s)
t=0.55 : header "ENCORE !" + sous-titre fade-in (depuis y -16)
t=0.55 : 6 dés tombent du haut (y -260→0, rotate aléatoire, back.out 1.8, stagger from: random)
t=0.7  : cellules de la grille apparaissent (stagger from edges, back.out 2, 0.012s each)
t=fin  : label "partie en cours" + emit done
```

**Nota** : la grille preview (10×6 = 60 cellules) utilise des couleurs aléatoires, pas les vraies données de grille.

---

### ColorCompletionOverlay.vue

**Props :** `color: ColorKey`, `playerName: string`

**Emits :** `done`

**Comportement :**
- Overlay semi-transparent sur la grille uniquement (pas plein écran)
- Reprend les 105 cases de `store.grid.cells` via `useGameStore()`
- Les cases de la couleur cible sont affichées normalement, les autres à 22% d'opacité
- Ruban "COMPLÉTÉ" centré
- Jeton "+5" qui vole vers la carte score (hors overlay)
- Score fictif qui s'incrémente (+5)

**Animation GSAP :**
```
t=0    : autres cases → opacity 0.22 (0.45s power2.out)
t=0.2  : ruban apparaît (back.out 2, scale 0.95→1, y 18→0)
t=0.5  : jeton +5 apparaît (back.out 2.5)
t=1.0  : jeton vole vers le score (x 420, y 240, scale 0.4, opacity 0, power2.in, 0.95s)
t=fin-0.25 : ligne bonus pulse jaune → transparent
t=fin  : cases reviennent à opacity 1, emit done après 3.5s total
```

---

### EndGameOverlay.vue

**Props :** `players: Array<{ name: string; isLocal: boolean; score: number; colors: number; columns: number; jokers: number; stars: number }>`

**Emits :** `replay`

**Comportement :**
- Overlay plein écran z-index 150
- Confettis (64 éléments rect/circ colorés)
- Trophée SVG
- Nom du gagnant en 52px
- Cartes joueurs (1er avec bordure jaune, autres grisés) avec barres de progression
- Scores qui comptent de 0 vers la valeur finale
- Bouton "Rejouer une partie →"

**Score affiché :** calculé dans le composant parent (`game/[id].vue`) depuis `store.players` — chaque joueur a un total transmis via props.

**Animation GSAP :**
```
t=0.1  : trophée scale 0→1 + rotate -45→0 (back.out 2.5) + wiggle 5 fois
t=0.5  : nom gagnant + sous-titre (back.out 1.8)
t=0.7  : cartes joueurs (stagger 0.12, back.out 1.6)
t=0.7  : confettis tombent (stagger from random, 1.6-2.8s, rotate aléatoire)
t=0.95 : scores comptent de 0 → total (1.2s power3.out)
t=1.0  : barres de progression (1s power3.out)
t=fin  : CTA fade-in
```

---

### GameDice.vue — Cube CSS 3D

**Props ajoutée :** `spinning?: boolean`

**Structure HTML remplacée :**
```html
<div class="die-scene">
  <div ref="cubeRef" class="die-cube">
    <div class="die-face die-face-front">  <!-- face 1 -->
    <div class="die-face die-face-back">   <!-- face 6 -->
    <div class="die-face die-face-right">  <!-- face 4 -->
    <div class="die-face die-face-left">   <!-- face 3 -->
    <div class="die-face die-face-top">    <!-- face 5 -->
    <div class="die-face die-face-bottom"> <!-- face 2 -->
  </div>
  <div class="die-shadow"></div>
</div>
```

**Dimensions :** 80×80px (au lieu de 52×52px), `perspective: 1000px`, `transform-style: preserve-3d`, `translateZ(40px)` par face.

**Contenu des faces :**
- Dé couleur : face `i` → `colorList[i]` = `['g','y','b','p','o','x']`, pastille colorée 48×48px avec halo lumineux
- Dé chiffre : face `i` → valeur `i+1`, grille de pips 3×3 (positions selon n)

**Mapping face → rotation finale :**
```ts
const FACE_ROTATION = {
  1: { x: 0,   y: 0   },
  2: { x: -90, y: 0   },
  3: { x: 0,   y: -90 },
  4: { x: 0,   y: 90  },
  5: { x: 90,  y: 0   },
  6: { x: 0,   y: 180 },
}
const COLOR_FACE_INDEX = { g: 1, y: 2, b: 3, p: 4, o: 5, x: 6 }
```

**Animation Spin (watch spinning: false → true) :**
```ts
const faceIndex = type === 'n' ? value : COLOR_FACE_INDEX[value]
const finalRot = FACE_ROTATION[faceIndex]
const spinX = (3 + rand(0,2)) * 360 + finalRot.x
const spinY = (3 + rand(0,2)) * 360 + finalRot.y

gsap.set(cube, { rotateX: 0, rotateY: 0 })
gsap.to(cube, { rotateX: spinX, rotateY: spinY, duration: 1.4, ease: 'power4.out' })
```

**CSS :**
- Face fond : `radial-gradient(circle at 30% 25%, #2a2a32 0%, #15151a 60%, #0a0a0e 100%)`
- Bord : `1px solid rgba(255,255,255,.06)`, ombres internes (inset)
- Pip ON : `radial-gradient(circle at 35% 30%, #fff 0%, #d8d8d8 40%, #888 100%)` + box-shadow débossé
- Shadow sous le dé : `radial-gradient(ellipse, rgba(0,0,0,.55), transparent 70%)`, `bottom: -22px`
- `.selected` / `.selectable:hover` conservés (élèvent le `.die-scene` via translateY)

---

### GameDices.vue — Modifications

Ajout d'un `ref isSpinning = ref(false)` et passage à `GameDice` :

```ts
async function handleRoll() {
  if (props.readonly) return
  const roll = rollAllDices()
  emit('roll', roll)
  isSpinning.value = true
  await new Promise(r => setTimeout(r, 1600))  // durée spin
  isSpinning.value = false
  // reset sélections...
}
```

```html
<GameDice
  :spinning="isSpinning"
  ...
/>
```

---

### index.vue — Modifications

```vue
<LoaderScreen v-if="showLoader" @done="showLoader = false" />
```

```ts
const showLoader = ref(true)
// showLoader se cache quand LoaderScreen émet 'done' (après ~2.8s)
```

---

### game/[id].vue — Modifications

```vue
<!-- Loader reconnexion -->
<LoaderScreen v-if="isReconnecting" subtitle="Reconnexion..." @done="isReconnecting = false" />

<!-- Launch overlay (première fois) -->
<LaunchOverlay v-if="showLaunchAnim" :player-name="lobby.localPlayerName" @done="showLaunchAnim = false" />

<!-- Color completion -->
<ColorCompletionOverlay
  v-if="store.lastColorCompleted"
  :color="store.lastColorCompleted.color"
  :player-name="completedPlayerName"
  @done="store.clearLastColorCompleted()"
/>

<!-- End game -->
<EndGameOverlay
  v-if="store.gameOver && showEndGame"
  :players="endGamePlayers"
  @replay="handleReplay"
/>
```

**Watchers ajoutés :**
- `isReconnecting = true` avant `await sync.setup()`, `false` après
- `showLaunchAnim = lobby.justStartedGame` (consommé en `onMounted` puis `lobby.justStartedGame = false`)
- `watch(store.gameOver)` → `showEndGame = true`

---

## Fichiers modifiés / créés

| Fichier | Action |
|---------|--------|
| `package.json` | `gsap` ajouté |
| `app/stores/gameStore.ts` | `lastColorCompleted` + `clearLastColorCompleted()` |
| `app/stores/lobbyStore.ts` | `justStartedGame: boolean` |
| `app/components/game/GameDice.vue` | Remplacé par cube 3D + Spin GSAP |
| `app/components/game/GameDices.vue` | `isSpinning` + passe prop aux dés |
| `app/components/animations/LoaderScreen.vue` | Créé |
| `app/components/animations/LaunchOverlay.vue` | Créé |
| `app/components/animations/ColorCompletionOverlay.vue` | Créé |
| `app/components/animations/EndGameOverlay.vue` | Créé |
| `app/pages/index.vue` | `LoaderScreen` au mount |
| `app/pages/game/[id].vue` | 4 overlays + watchers |

---

## Invariants à respecter

- **GSAP uniquement côté client** : tous les appels GSAP dans `onMounted` ou `watch` avec `if (!process.client) return`.
- **`spinning` est un signal one-shot** : GameDice.vue reset `rotateX/Y` à 0 avant chaque spin. Le parent remet `isSpinning = false` après 1.6s.
- **`lastColorCompleted` est null-safe** : le composant overlay vérifie `store.lastColorCompleted` avant de jouer. Une seule animation à la fois (pas de file).
- **GameDice.vue garde son API props** : `type`, `value`, `selected`, `selectable` — seule `spinning` est ajoutée.
- **Taille des dés** : passe de 52px à 80px. Vérifier que `.dices-row` dans GameDices.vue a assez d'espace (flex-wrap déjà présent).
