# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install      # installs + runs `nuxt prepare` (postinstall hook)
pnpm dev          # Start dev server at http://localhost:3000
pnpm build        # Production build
pnpm preview      # Preview production build
pnpm generate     # Static site generation
pnpm test         # Run the vitest suite (engine, store, bots, bot/store integration)
pnpm bench        # Time the placement enumerator
pnpm eval         # Agent benchmark -> public/data/eval.json
pnpm tune         # CEM weight optimisation -> public/data/tuned-weights.json
pnpm tune:v2      # CEM on the 21-parameter heuristic -> public/data/tuned-weights-v2.json
```

`eval` and `tune` accept flags after `--`, e.g. `pnpm eval -- --games 500 --mode first`.

## Architecture Overview

This is a Nuxt 4 multiplayer board game called "Encore!" — a dice + grid colouring game (inspired by *Encore/That's Pretty Clever*). Stack: Vue 3 + Pinia + Supabase + Tailwind CSS.

### Project config
- Nuxt 4 `app/` directory layout (pages/stores/composables/services/data under `app/`).
- Pure game rules live in `engine/` at the **project root**, not under `app/` — imported as `~~/engine/...` so Node scripts (bots, training) can use them with no Nuxt runtime.
- TypeScript `strict: false` (see `nuxt.config.ts`) — do not assume strict null checks.
- `@nuxtjs/supabase` with `redirect: false` — no built-in auth redirect. Player identity is anonymous, tracked via `localStorage` key `encore_player_id`, not Supabase Auth.
- Requires env vars `SUPABASE_URL` and `SUPABASE_KEY` (standard `@nuxtjs/supabase` names). No `.env.example` in repo.
- No migrations folder in repo; schema (`games`, `game_players`, `game_events`) lives only in the remote Supabase project — apply schema changes there manually.

### Game rules summary
- 7×15 grid (105 cells), each cell has a **colour** (`g/y/b/p/o`) and optionally a **star**.
- Each turn, 3 colour dice + 3 number dice are rolled. Players pick one colour die + one number die to form a combo (colour × count).
- Players must check exactly `count` cells of the chosen colour. The cells checked in one turn must be mutually contiguous (already-checked cells do **not** bridge a gap), all inside one colour block, and the group must be anchored.
- **Anchoring**: a group is legal if it touches an already-checked cell orthogonally **or** contains a cell in the start column H (index 7). Column H is a **permanent** anchor, not a first-move-only rule — see the German original quoted in `engine/placement.ts`. The first-move rule needs no special case: with nothing checked, "touches a checked cell" is false everywhere, so the predicate reduces to "contains an H cell".
- Scoring: completing a full colour = 5pts (first) / 3pts (others); completing a column = variable points; jokers left = +1 each; unchecked stars at game end = −2 each.
- Game ends when any player completes 2 full colours.
- **First 3 turns**: all players play simultaneously (no "active player" distinction).

### Turn phases (`TurnPhase` in `gameStore.ts`)
```
waiting_roll → active_selecting → passive_selecting → turn_end → (next turn)
                  (skipped for turns 0–2)
```

### State management

**`app/stores/gameStore.ts`** — single source of truth for all game state:
- `players[]`: each player tracks `checkedCells`, `pendingCells`, `validCombos`, `colorBonus`, `columnBonus`, `jokersUsed`, `pendingJokers`
- `phase`, `currentRoll`, `activePlayerId`, `turnNumber`
- Key actions: `rollDicesWithResult()`, `confirmActiveCombo()`, `confirmPassiveCombo()`, `togglePendingCell()`, `confirmPendingCells()`, `nextTurn()`
- Cell placement uses pre-computed `validCombos` (set on combo confirmation) filtered via `selectableCells()` on each click
- **Jokers are debited in `confirmPendingCells()`, not on combo confirmation.** A confirmed-then-passed combo must not burn an exclamation point. `pendingJokers` holds the committed-but-unspent amount. Event replay reconstructs `jokersUsed` from the same CONFIRM/PLACE stream, so no payload carries it.
- Confirming a combo with no legal placement auto-passes the player (safety net); `canPlayCombo()` / `hasAnyPlayableCombo()` let the UI disable it beforehand

**`app/stores/lobbyStore.ts`** — pre-game lobby: create/join by 6-character code, ready-up flow, Supabase Realtime watching `game_players` table. Player identity persisted in `localStorage` (`encore_player_id`).

### Multiplayer sync architecture

**`app/services/realtimeService.ts`** — thin wrapper around Supabase Realtime broadcast (channel `game:{id}`). Sends/receives `GameAction` objects with `type`, `senderId`, `payload`.

**`app/composables/Usegamesync.ts`** — the sync orchestrator:
1. `setup()`: initialises store players, replays all past `game_events` from Supabase (for reconnection), then joins Realtime channel
2. `dispatch(type, payload)`: applies action locally first (optimistic), broadcasts to peers, persists to `game_events` table (fire-and-forget)
3. `applyRemoteAction()`: ignores own actions (already applied), applies others via the same `applyToStore()` switch

Remote clients bypass store guards that check `phase` (e.g. `PASS_ACTIVE` is applied manually in `applyToStore` to avoid the `active_selecting` guard).

### Grid data

**`app/data/grids/`** — 8 official grids (`grid-01` through `grid-08`). Each grid file exports `GRID_XX_CELLS` as `[ColorKey, boolean][]` (105 entries, row-major). `grid-01.ts` also exports `COLOR_MAP`, `COLUMN_POINTS`, and `COLS` which are used app-wide.

**`app/data/grids/index.ts`** — `GRID_MAP` (record of all grids by id) and `GridId` type.

### Game logic

**`engine/`** — headless rules engine, plain data, zero Vue/Pinia. Shared by the app, the tests and the bots. Imported as `~~/engine/...` from the app (Nuxt maps `~~` to the project root) and by relative path from Node scripts.
- `grid.ts`: dimensions, precomputed orthogonal `NEIGHBORS`, `START_COL = 7`
- `mask.ts`: `CheckedMask` = `Uint8Array(105)`; `maskFromSet` / `setFromMask` convert at the store boundary
- `placement.ts`: `isAnchor()`, `legalPlacements()` (ESU connected-subgraph enumeration — each placement produced exactly once, no dedup pass), `hasLegalPlacement()`, `selectableCells()`, `validatePlacement()`
- `scoring.ts`: colour/column completion, star malus, `BonusMode` (`first`/`others`/`average`). Single-agent play has no opponent, so the mode is an explicit choice and is always reported with any score
- `dice.ts`: faces, seeded RNG, and the 56 roll classes per die type (`C(8,3)`, probabilities sum to 1)
- `state.ts`: `Sheet` (pure data), `legalMoves` (resolves joker faces, keeps the cheapest dice pair per combo), `applyMove`
- Tests in `engine/__tests__/` encode the rulebook, including a property test against a brute-force reference

### Supabase schema (3 tables)
- `games`: id, code (6-char), status, grid_id, max_players, turn_duration
- `game_players`: game_id, player_id, player_name, seat, is_ready
- `game_events`: game_id, turn_number, player_id, event_type, payload — append-only log used for replay on reconnection

### Pages
- `/` (`app/pages/index.vue`) — home: create or join a game
- `/game/[id]` (`app/pages/game/[id].vue`) — main game view; handles page-refresh reconnection by re-fetching from Supabase if lobby state is empty
- `/solo` (`app/pages/solo.vue`) — local game against bots. **No Supabase, no Realtime**: drives `gameStore` directly, so it works offline and needs no schema change
- `/ia` (`app/pages/ia.vue`) — agent benchmark, read from `public/data/*.json`

### Agents (`bots/`)

Plain TypeScript on top of `engine/`, no Nuxt runtime. Run via `tsx`.

- `heuristic.ts` — 6-parameter position evaluation. Scores **progress**, not raw score: the real score is 0 for most of a game, so a greedy choice on raw score is degenerate.
- `heuristicV2.ts` — 21-parameter version (frontier size, live colours, free value tables). `V2Scorer` aggregates the sheet once per turn and evaluates each candidate by **local delta** — a full rescan per candidate was ~25x too slow. The delta is property-tested against a full recompute.
- `cem.ts` — cross-entropy method, shared by both tuners.
- `basic.ts` (random, greedy), `expectimax.ts`, `montecarlo.ts` — the last two are offline probes, far too slow for the browser.
- `play.ts` — headless single-agent game loop.

**`app/composables/useBotPlayer.ts`** bridges engine and store: converts `checkedCells` to a mask, calls `legalMoves`, and maps the chosen move back to dice indices. Those indices are **relative to the dice list passed in** — for a passive player that is `availableForPassive`, which is what the store actions expect.

### Measured findings

Numbers come from `pnpm eval` (2000 paired games, 8 grids). Comparisons are paired: at equal game index every agent sees the same dice on the same grid, and the harness reports the paired delta with a 95% interval.

- CEM tuning is worth **+4.39 [+4.15, +4.63]** over hand-set weights, validated on disjoint holdout seeds.
- 2-ply expectimax: **+0.28 [-0.26, +0.82]** — not significant, for ~140x the cost. Dice are fully rerolled each turn, so one turn of lookahead adds nothing the position evaluation does not already capture.
- The 21-parameter heuristic is **-0.56 [-0.78, -0.33]** — the richer representation does not help.
- Monte-Carlo rollouts with the tuned policy are the only thing that genuinely beats it, by roughly +1 point for ~3700x the cost.

Keep the negative results. They are measurements, not gaps.

### Key composables
- **`Usegamesync.ts`** — multiplayer sync (see above)
- **`Useturntimer.ts`** — countdown timer; on expiry the active player auto-passes any players who haven't acted
- Filename convention: capitalised `Use*.ts` (non-standard; Nuxt auto-import usually expects `useX.ts`). Keep the pattern when adding new ones to match existing imports.

### Timer logic
- Roll timer: 15s auto-roll if active player doesn't roll
- Turn timer: duration from `lobby.turnDuration` (default 60s); only the active player dispatches expiry actions to avoid duplicate events
