# Plan d'action — Multijoueur Encore (Noch Mal)
> Document de référence complet pour Claude Code ou tout autre agent reprenant le projet.
> Toutes les décisions d'architecture, bugs rencontrés, solutions appliquées et tâches restantes sont ici.

---

## 🗂️ Structure du projet

```
encore-game/
├── app/
│   ├── components/
│   │   └── game/
│   │       ├── GameCell.vue
│   │       ├── GameDice.vue
│   │       ├── GameDices.vue       ← modifié (Phase 4.2)
│   │       ├── GameGrid.vue
│   │       └── GameJokers.vue
│   ├── composables/
│   │   ├── useGameSync.ts          ← créé (Phase 3.1)
│   │   └── useTurnTimer.ts         ← créé (Phase 3.2)
│   ├── data/
│   │   └── grids/
│   │       └── grid-01.ts          ← NE PAS TOUCHER
│   ├── pages/
│   │   ├── index.vue               ← remplacé (Phase 4.1) — lobby
│   │   └── game/
│   │       └── [id].vue            ← créé (Phase 4.2) — jeu
│   ├── services/
│   │   └── realtimeService.ts      ← créé (Phase 2.1)
│   ├── stores/
│   │   ├── gameStore.ts            ← modifié (Phase 2.3)
│   │   └── lobbyStore.ts           ← créé (Phase 2.2)
│   ├── types/
│   │   └── database.types.ts       ← généré via CLI Supabase
│   └── utils/
│       └── gameRules.ts            ← NE PAS TOUCHER
├── .env                            ← credentials Supabase
└── nuxt.config.ts                  ← modifié (Phase 1.5)
```

---

## 🔴 Règles de travail importantes

- **Toujours demander les fichiers existants** avant de créer/modifier quoi que ce soit
- **Ne jamais supposer** le contenu d'un fichier existant — toujours le lire d'abord
- **Format** : pages/composants en `.vue` avec `<script setup lang="ts">`, stores/utils/composables en `.ts`
- **Ne jamais importer depuis `@supabase/supabase-js`** directement — utiliser `any` pour typer les channels et le client Supabase (voir section Pièges)
- **Problème de casse Windows** : après renommage d'un fichier, toujours lancer `npx nuxt prepare`

---

## 🏗️ Stack technique

| Outil | Version |
|---|---|
| Nuxt | 4.3.1 |
| Vue | 3.5 |
| Pinia | 3.0.4 |
| TypeScript | strict: false |
| @nuxtjs/supabase | 2.0.4 |
| @nuxtjs/tailwindcss | présent |

---

## 🔑 Infos Supabase

| Clé | Valeur |
|---|---|
| Project URL | https://qhzmraucircucfxeghll.supabase.co |
| Project ID | qhzmraucircucfxeghll |
| Publishable Key | sb_publishable_KIyG876QjRiW0pEkdh3ktQ_XL0z1IHb |

Variables `.env` :
```
SUPABASE_URL=https://qhzmraucircucfxeghll.supabase.co
SUPABASE_KEY=<anon key>
```

---

## 🗄️ Schéma base de données

```sql
-- Parties
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,         -- code 6 caractères ex: "XK92PL"
  status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting' | 'playing' | 'finished'
  grid_id TEXT NOT NULL DEFAULT 'grid-01',
  max_players INT NOT NULL DEFAULT 6,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Joueurs dans une partie
CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,           -- UUID généré côté client (pas FK users)
  player_name TEXT NOT NULL,
  seat INT NOT NULL,                 -- ordre de jeu (0 = créateur/premier joueur actif)
  is_ready BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Événements de jeu (pour replay à la reconnexion)
CREATE TABLE game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  turn_number INT NOT NULL,
  player_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX ON games(code);
CREATE INDEX ON game_events(game_id, created_at);

-- Realtime (à exécuter en SQL dans le dashboard Supabase)
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
-- game_events n'a PAS Realtime — on utilise le broadcast channel pour le live
```

---

## ⚙️ nuxt.config.ts final

```ts
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@nuxtjs/supabase',
  ],
  supabase: {
    redirect: false,
    // PAS de types: false — laisser le module charger app/types/database.types.ts automatiquement
  },
  typescript: {
    strict: false
  }
})
```

---

## 🏛️ Architecture multijoueur

### Flux d'une action joueur
```
Joueur clique
  → game/[id].vue intercepte l'event de GameDices/GameGrid
  → sync.dispatch('ACTION_TYPE', payload)
      → 1. applyToStore() localement (optimistic update)
      → 2. sendAction() broadcast via Supabase Realtime channel
      → 3. INSERT dans game_events (fire-and-forget)
  → Autre client reçoit via onAction callback
      → applyRemoteAction()
          → ignore si senderId === localPlayerId
          → applyToStore() sur le client distant
```

### Mapping complet applyToStore
```
ROLL_DICES        → store.rollDicesWithResult(payload.roll)
CONFIRM_ACTIVE    → store.confirmActiveCombo(payload.colorDiceIndex, payload.numberDiceIndex, payload.jokerColor, payload.jokerCount)
CONFIRM_PASSIVE   → store.confirmPassiveCombo(payload.playerId, payload.colorDiceIndex, payload.numberDiceIndex, payload.jokerColor, payload.jokerCount)
PASS_ACTIVE       → forcer manuellement (voir ⚠️ Bug PASS_ACTIVE ci-dessous)
PASS_PASSIVE      → store.passPassiveTurn(payload.playerId)
TOGGLE_CELL       → store.togglePendingCell(payload.playerId, payload.cellIdx)
CONFIRM_PLACEMENT → store.confirmPendingCells(payload.playerId)
CANCEL_PLACEMENT  → store.cancelPendingCells(payload.playerId)
USE_JOKER         → store.useJoker(payload.playerId)
NEXT_TURN         → store.nextTurn()
TIMER_EXPIRED     → store.passPassiveTurn(payload.playerId)
```

### Règles d'architecture invariantes
| Règle | Détail |
|---|---|
| `validCombos` | Ne se synchronise JAMAIS — recalculé localement après chaque confirm |
| `pendingCells` | Synchronisé via TOGGLE_CELL — tous voient les sélections en cours |
| `checkedCells` | `Set<number>` → sérialiser en `Array` pour JSON, reconvertir à la réception |
| Timer | Local sur chaque client — seul le joueur actif émet TIMER_EXPIRED + NEXT_TURN |
| Double application | `dispatch` = local + broadcast / `applyRemoteAction` ignore ses propres actions |
| Ordre joueurs | Triés par `seat` avant init du store dans `useGameSync.setup()` |
| Canal Realtime | Nommé `game:${gameId}` — identique partout sinon les clients ne se voient pas |
| Permissions | Un joueur ne peut interagir qu'avec ses propres dés/grille (voir Phase 5.1) |

---

## ⚠️ Pièges connus et solutions

### Ne jamais importer depuis @supabase/supabase-js
```ts
// ❌ INTERDIT — provoque des erreurs de types incompatibles
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

// ✅ CORRECT — utiliser any
const channel = ref<any>(null)
function joinGameChannel(supabase: any, gameId: string, onAction: ...) { ... }
```

### Problème de casse sur Windows
Windows est insensible à la casse, Nuxt/TypeScript non. Après renommage d'un fichier :
```bash
npx nuxt prepare
```

### database.types.ts manquant → erreurs `never` sur les tables
```bash
npx supabase login
npx supabase gen types typescript --project-id qhzmraucircucfxeghll > app/types/database.types.ts
```
Ne **jamais** mettre `types: false` dans `nuxt.config.ts` — ça supprime l'autocomplétion et crée des erreurs partout.

### Type du channel dans le state Pinia
```ts
// ❌ Provoque des erreurs de types incompatibles
lobbyChannel: null as ReturnType<ReturnType<typeof useSupabaseClient>['channel']> | null

// ✅ Correct
// eslint-disable-next-line @typescript-eslint/no-explicit-any
lobbyChannel: null as any
```

### Bug PASS_ACTIVE sur les clients distants ⚠️
`store.passActiveTurn()` a un guard `if (this.phase !== 'active_selecting') return`.
Un client distant peut avoir sa phase déjà à `passive_selecting` quand il reçoit PASS_ACTIVE → early return → état incohérent.

**Solution dans `applyToStore` :**
```ts
case 'PASS_ACTIVE': {
  const activePlayer = store.players.find(p => p.id === store.activePlayerId)
  if (activePlayer) {
    activePlayer.hasPassed = true
    activePlayer.hasPlaced = true
  }
  store.activeSelection = null
  if ((store.phase as string) === 'active_selecting') {
    store.phase = 'passive_selecting'
  }
  break
}
```

### Timer : ne démarre pas si phase déjà active_selecting au montage (après replay)
Le watcher sur `store.phase` ne se déclenche pas si la valeur était déjà `active_selecting` au moment du `setup()`. Solution : démarrer le timer manuellement dans `onMounted` après le `setup()` si la phase est déjà `active_selecting`.

```ts
onMounted(async () => {
  await sync.setup(...)
  currentViewPlayer.value = lobby.localPlayerId
  if ((store.phase as string) === 'active_selecting') {
    startTimer()
  }
})
```

### Comparaison TS impossible sur store.phase
Dans certains contextes, TS infère un type union qui exclut `'turn_end'` → erreur de comparaison. Utiliser un cast :
```ts
if ((store.phase as string) !== 'turn_end') { ... }
```

---

## ✅ Phases complétées

### Phase 1 — Socle Supabase ✅
Tables créées, index, Realtime activé sur `games` et `game_players`.

### Phase 1.5 — Installation Supabase ✅
`@nuxtjs/supabase` 2.0.4, `nuxt.config.ts` configuré, `database.types.ts` généré.

### Phase 2.1 — realtimeService.ts ✅
`joinGameChannel`, `sendAction`, `leaveGameChannel`. Types `GameActionType` et `GameAction` exportés.

### Phase 2.2 — lobbyStore.ts ✅
State complet, `createGame`, `joinGame`, `setReady`, `watchLobby`, `leaveLobby`, `init`.
- `LobbyPlayer` exporté pour `useGameSync.ts`
- Getter `isHost` (seat === 0)
- `localPlayer` getter pour accès rapide au joueur local

### Phase 2.3 — gameStore.ts (modifications) ✅
- `rollAllDices()` exportée
- `initPlayers(players[])` ajoutée — réinitialise tout le state
- `rollDicesWithResult(roll)` ajoutée
- `gameId: null as string | null` ajouté dans le state

### Phase 3.1 — useGameSync.ts ✅
`setup`, `dispatch`, `applyToStore`, `applyRemoteAction`, `replayEvents`, `teardown`.
Retourne `{ isReady, localPlayerId, setup, dispatch, teardown }`.

### Phase 3.2 — useTurnTimer.ts ✅
`start(onExpire)`, `stop()`, `reset(onExpire)`. Timer purement local, 60 secondes.

### Phase 4.1 — index.vue (lobby) ✅
Formulaires créer/rejoindre, salle d'attente avec statuts joueurs, navigation automatique.

### Phase 4.2 — game/[id].vue ✅
Page de jeu complète avec sync multijoueur, timer, indicateur connexion.
- `GameDices.vue` modifié pour émettre des events au lieu d'appeler le store directement
- Tous les events interceptés dans `[id].vue` qui appelle `sync.dispatch()`

---

## 🚧 Phases restantes

### Phase 5.1 — Permissions joueur ✅

**Implémenté** :
- `GameDices.vue` : prop `readonly?: boolean` — guards sur `handleRoll`, `selectColor`, `selectNumber`, `confirmCombo`, `handlePass`. Classe `.dices-panel--readonly` : `opacity: 0.65 + pointer-events: none`.
- `GameGrid.vue` : prop `readonly?: boolean` — guard dans `handleCellClick`, `disabled` sur boutons confirm/cancel. Classe `.game-grid--readonly` : `pointer-events: none` sur les cellules via `:deep(.game-cell)`.
- `game/[id].vue` : `isLocalPlayer = currentViewPlayer === sync.localPlayerId`. `:readonly="!isLocalPlayer"` passé à `GameDices` et `GameGrid`. Guard sur `@use` de `GameJokers`.

### Phase 5.2 — Tests de synchronisation ✅ (en local, 2 onglets)
- [x] Test à 2 onglets / navigateurs en local — OK
- [x] RLS activé dans Supabase — OK
- [ ] Vérifier synchronisation du roll (même résultat dans les deux onglets)
- [ ] Vérifier TOGGLE_CELL en temps réel (cases en attente visibles par tous)
- [ ] Vérifier expiration du timer (seul le joueur actif émet, les autres avancent)
- [ ] Vérifier qu'un joueur passif ne peut pas cliquer "Tour suivant"
- [ ] Requêtes simultanées : concurrence gameplay analysée → safe (game_events append-only, actions scopées par playerId). Seul risque : race condition sur le `seat` au join → ajouter contrainte SQL : `ALTER TABLE game_players ADD CONSTRAINT unique_game_seat UNIQUE (game_id, seat);`

### Phase 5.3 — Bugs connus à corriger ✅
- [x] Joueur passif non considéré comme ayant passé (fix PASS_ACTIVE dans applyToStore)
- [x] Timer lié entre les deux joueurs / ne démarre qu'après première sélection
- [x] CONFIRM_PASSIVE index filtrés vs bruts — analysé, pas de bug : les deux clients utilisent `availableForPassive` (même tableau filtré) car `activeSelection` est toujours set avant via CONFIRM_ACTIVE

---

## 🌐 Objectif : Jouer avec quelqu'un à distance

### Blocages identifiés (par ordre de priorité)

#### Phase 6.1 — RLS Supabase ✅ (à appliquer dans le dashboard Supabase)
RLS désactivé actuellement. SQL à exécuter dans Supabase → SQL Editor quand prêt :

```sql
-- GAMES
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games_select" ON games FOR SELECT USING (true);
CREATE POLICY "games_insert" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "games_update" ON games FOR UPDATE USING (true)
  WITH CHECK (status IN ('waiting', 'playing', 'finished'));
-- Pas de DELETE

-- GAME_PLAYERS
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gp_select" ON game_players FOR SELECT USING (true);
CREATE POLICY "gp_insert" ON game_players FOR INSERT WITH CHECK (true);
CREATE POLICY "gp_update" ON game_players FOR UPDATE USING (true);
-- Pas de DELETE

-- GAME_EVENTS (log immuable — pas d'UPDATE ni de DELETE)
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ge_select" ON game_events FOR SELECT USING (true);
CREATE POLICY "ge_insert" ON game_events FOR INSERT WITH CHECK (true);
-- Pas d'UPDATE, pas de DELETE
```

#### Phase 6.2 — Déploiement 🔴 (PRIORITÉ pour accès distant)
Sans URL publique, l'autre joueur ne peut pas accéder à l'app.

**Option A — Vercel (recommandé pour Nuxt) :**
```bash
npm i -g vercel
vercel
# Configurer les env vars dans le dashboard Vercel :
# SUPABASE_URL = https://qhzmraucircucfxeghll.supabase.co
# SUPABASE_KEY = <anon key>
```

**Option B — Test rapide sans déploiement (ngrok) :**
```bash
# Dans un terminal : lancer le dev server
pnpm dev
# Dans un autre terminal : tunnel vers internet
npx ngrok http 3000
# Partager l'URL ngrok à l'autre joueur
```
⚠️ ngrok = session temporaire, l'URL change à chaque relance.

**Variables d'env à configurer sur le service de déploiement :**
```
SUPABASE_URL=https://qhzmraucircucfxeghll.supabase.co
SUPABASE_KEY=<anon key>
```

#### Phase 6.3 — Résistance au refresh de page ✅

**Implémenté :**
- `lobbyStore.init()` : `sessionStorage` → `localStorage` (survit à la fermeture d'onglet)
- `game/[id].vue` `onMounted` : si `lobby.players` vide → `lobby.init()` + refetch `game_players` depuis Supabase → vérifie que le joueur local est bien participant → reconstitue `lobby.players` et `lobby.gameId` → continue normalement avec `sync.setup()`
- Expulsion vers `/` uniquement si : player_id absent du localStorage OU partie introuvable en base OU joueur non participant

#### Phase 6.4 — Validation distante
- [ ] Tester créer + rejoindre depuis 2 appareils/navigateurs différents
- [ ] Vérifier que le code de partie s'affiche et peut être partagé
- [ ] Vérifier la navigation automatique lobby → jeu sur les deux clients
- [ ] Jouer une partie complète à distance
- [ ] Vérifier qu'un refresh en cours de partie rejoue correctement (après Phase 6.3)

---

## 🔒 Sécurité — À faire avant mise en production publique

> Ces actions ne bloquent pas le développement mais sont **obligatoires avant d'exposer l'app à des inconnus**.

### SEC-1 — RLS Supabase (actuellement désactivé)
RLS est désactivé → n'importe qui avec la clé anon peut lire, écrire, supprimer toutes les données.
À activer avec des policies minimales une fois l'app stable :

```sql
-- GAMES
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
-- Lecture libre (codes publics par design)
CREATE POLICY "games_select_public" ON games FOR SELECT USING (true);
-- Insertion libre (créer une partie)
CREATE POLICY "games_insert_public" ON games FOR INSERT WITH CHECK (true);
-- Mise à jour uniquement si status = 'waiting' → 'playing' (évite les sauts vers 'finished')
CREATE POLICY "games_update_status" ON games FOR UPDATE USING (status IN ('waiting', 'playing'));
-- Pas de DELETE public

-- GAME_PLAYERS
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gp_select_public" ON game_players FOR SELECT USING (true);
CREATE POLICY "gp_insert_public" ON game_players FOR INSERT WITH CHECK (true);
-- Un joueur ne peut mettre à jour que sa propre ligne
CREATE POLICY "gp_update_own" ON game_players FOR UPDATE USING (player_id = current_setting('request.headers', true)::json->>'x-player-id');
-- Note : sans auth Supabase, la policy UPDATE reste permissive — voir SEC-4

-- GAME_EVENTS
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ge_select_public" ON game_events FOR SELECT USING (true);
CREATE POLICY "ge_insert_public" ON game_events FOR INSERT WITH CHECK (true);
-- Pas d'UPDATE ni de DELETE
```

### SEC-2 — Rate limiting sur les insertions
Sans rate limiting, un client peut spammer `game_events` et saturer la BDD.

**Option A — Supabase Edge Function** (si on passe par une API intermédiaire) : limiter à N events/seconde par player_id.

**Option B — Côté BDD** : ajouter un trigger qui bloque si plus de 50 events en 10 secondes pour un même game_id :
```sql
-- À créer comme fonction + trigger Postgres
-- Vérifier COUNT(*) sur game_events WHERE game_id = NEW.game_id AND created_at > NOW() - INTERVAL '10s'
-- Si > 50 → RAISE EXCEPTION
```

**Option C — Simple pour un projet perso** : ajouter `max_players` comme garde-fou naturel + surveiller la taille de la table via le dashboard Supabase.

### SEC-3 — Validation des event_type dans game_events
Dans `replayEvents()` (`useGameSync.ts`), tous les events en base sont rejoués sans validation. Un event_type inconnu provoque un `applyToStore` no-op (le switch n'a pas de case correspondante), ce qui est safe. Mais un event_type mal formé avec un payload malveillant pourrait causer des erreurs silencieuses.

**Fix à ajouter dans `applyToStore` :**
```ts
const VALID_EVENT_TYPES: GameActionType[] = [
  'ROLL_DICES', 'CONFIRM_ACTIVE', 'CONFIRM_PASSIVE', 'PASS_ACTIVE',
  'PASS_PASSIVE', 'TOGGLE_CELL', 'CONFIRM_PLACEMENT', 'CANCEL_PLACEMENT',
  'USE_JOKER', 'NEXT_TURN', 'TIMER_EXPIRED'
]
// Dans replayEvents, filtrer avant d'appeler applyToStore :
if (!VALID_EVENT_TYPES.includes(event.event_type as GameActionType)) return
```

### SEC-4 — Identité joueur (pas d'auth réelle)
Le `player_id` est un UUID généré côté client, stocké en `sessionStorage` (futur: `localStorage`).
**Risque** : un joueur peut usurper l'identité d'un autre en copiant son UUID.

Pour un jeu entre amis → acceptable.
Pour une app publique → nécessite Supabase Auth (login anonyme ou OAuth) :
```ts
// Auth anonyme Supabase (si besoin futur)
const { data } = await supabase.auth.signInAnonymously()
// data.user.id remplace le player_id généré localement
```

### SEC-5 — Sanitisation des inputs utilisateur
Les noms de joueurs et codes de partie sont affichés dans le DOM via Vue.
Vue échappe automatiquement les interpolations `{{ }}` → pas de XSS via template.
**Mais** vérifier qu'il n'y a pas de `v-html` avec des données utilisateur (il n'y en a pas actuellement).

Ajouter des limites de longueur côté client (déjà présent si les inputs ont `maxlength`) et côté BDD :
```sql
-- Limiter la taille des champs texte
ALTER TABLE game_players ADD CONSTRAINT player_name_length CHECK (char_length(player_name) <= 20);
ALTER TABLE games ADD CONSTRAINT code_format CHECK (code ~ '^[A-Z0-9]{6}$');
```

### SEC-6 — Variables d'environnement sur le serveur Hetzner
La clé anon Supabase est publique par design (elle est dans le bundle client), mais la `service_role` key ne doit **jamais** apparaître côté client.
- `.env` → ne pas committer (vérifier `.gitignore`)
- Sur Hetzner : utiliser des variables d'env système ou un fichier `.env` hors du repo

```bash
# Vérifier que .env est ignoré
grep ".env" .gitignore
```

### Ordre recommandé pour la mise en prod
1. SEC-6 (env vars) ✅ déjà dans .gitignore
2. SEC-5 (maxlength inputs) ✅ déjà présent dans index.vue
3. SEC-3 (validation event_type) ✅ implémenté dans useGameSync.ts
4. SEC-2 (rate limiting) — Option C suffit pour commencer (surveiller dashboard)
5. SEC-1 (RLS) — quand l'app est stable et testée
6. SEC-4 (auth) — seulement si ouvert au public

---

## 📋 Résumé des fichiers et leur rôle

| Fichier | Rôle | Statut |
|---|---|---|
| `realtimeService.ts` | Canal Supabase Realtime — join/send/leave | ✅ |
| `lobbyStore.ts` | Gestion du lobby (créer/rejoindre/attendre) | ✅ |
| `gameStore.ts` | État du jeu — logique pure | ✅ modifié |
| `useGameSync.ts` | Pont entre gameStore et Realtime | ✅ |
| `useTurnTimer.ts` | Timer local 60s par tour | ✅ |
| `index.vue` | Page lobby | ✅ |
| `game/[id].vue` | Page de jeu | ✅ |
| `GameDices.vue` | Panneau dés — émet events, prop readonly | ✅ modifié (Phase 5.1) |
| `GameGrid.vue` | Grille de jeu — prop readonly | ✅ modifié (Phase 5.1) |
| `GameCell.vue` | Cellule individuelle | non modifié |
| `GameJokers.vue` | Compteur jokers — guard @use dans [id].vue | non modifié |
| `gameRules.ts` | Logique de placement — NE PAS TOUCHER | ✅ intact |
| `grid-01.ts` | Données de la grille — NE PAS TOUCHER | ✅ intact |
