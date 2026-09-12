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
pnpm tune:v3      # CEM on the v3 heuristic -> public/data/tuned-weights-v3.json
pnpm calibrate    # difficulty calibration -> public/data/difficulty.json
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

RLS is enabled on all three, with permissive policies (`using true`). Two changes
were applied for multiplayer bots and are **not** reflected in any file in this
repo — the schema lives only in the remote project:

- policy `gp_delete` on `game_players`, so a row can be removed. There was no
  DELETE policy before, and the app deleted nothing anywhere.
- `game_players` set to `replica identity full`. Without it a DELETE event
  carries only the primary key, so the Realtime subscription's
  `game_id=eq.<id>` filter cannot match and other clients never see a player
  disappear.

**Known pre-existing bug, not fixed:** a player who joins a lobby and closes the
tab without readying up leaves a row at `is_ready = false`. The start condition
requires *every* row ready, so the lobby can never start again. `gp_delete` is
the prerequisite for fixing it.

### Pages
- `/` (`app/pages/index.vue`) — home: create or join a game, and the lobby. The host can add bots there (see "Bots in multiplayer")
- `/game/[id]` (`app/pages/game/[id].vue`) — main game view; handles page-refresh reconnection by re-fetching from Supabase if lobby state is empty
- `/solo` (`app/pages/solo.vue`) — local game against bots. **No Supabase, no Realtime**: drives `gameStore` directly, so it works offline and needs no schema change
- `/ia` (`app/pages/ia.vue`) — agent benchmark, read from `public/data/*.json`

### Agents (`bots/`)

Plain TypeScript on top of `engine/`, no Nuxt runtime. Run via `tsx`.

- `heuristic.ts` — 6-parameter position evaluation. Scores **progress**, not raw score: the real score is 0 for most of a game, so a greedy choice on raw score is degenerate.
- `heuristicV3.ts` — **the current best policy.** Features come from an experienced player, and crucially each term is **gated by turn number**: isolated-component penalties (shape), early frontier and early bonus on the extreme columns, colour value rising with the turn, joker reluctance. The two phase horizons are themselves tuned parameters, so a wrong phase intuition collapses to zero rather than being baked in. `V3Scorer` evaluates candidates by local delta; the delta is property-tested against a full recompute.
- `difficulty.ts` / `scorers.ts` — one policy degraded by a softmax temperature over per-decision z-scored values. Levels are calibrated by bisection on a target score (`scripts/calibrate.ts`), not hand-set. Softmax rather than epsilon-greedy: epsilon-greedy produces blunders, softmax produces merely sub-optimal moves, which is what a weaker human does.
- `heuristicV2.ts` — 21-parameter version (frontier size, live colours, free value tables). `V2Scorer` aggregates the sheet once per turn and evaluates each candidate by **local delta** — a full rescan per candidate was ~25x too slow. The delta is property-tested against a full recompute.
- `cem.ts` — cross-entropy method, shared by both tuners.
- `basic.ts` (random, greedy), `expectimax.ts`, `montecarlo.ts` — the last two are offline probes, far too slow for the browser.
- `play.ts` — headless single-agent game loop.

**`app/composables/useBotPlayer.ts`** bridges engine and store: converts `checkedCells` to a mask, calls `legalMoves`, and maps the chosen move back to dice indices. Those indices are **relative to the dice list passed in** — for a passive player that is `availableForPassive`, which is what the store actions expect.

### Bots in multiplayer

A bot is an ordinary `game_players` row; its `player_id` is what marks it, not a
column. `app/utils/botIdentity.ts` owns that convention (`bot:<difficulty>:<n>`)
and is the only place that parses it — nothing else compares id strings. It
imports `DifficultyId` as a **type only** and re-declares the three labels, so
the lobby on the home page does not pull the bot engine into its bundle; the
duplication is guarded by a test.

`lobbyStore.addBot()` inserts with `is_ready: true` (a bot has nobody to click
"ready", and the start condition still requires everyone ready). Seats come from
`max(seat) + 1`, not from a row count, because a count reuses an occupied seat
after a removal.

**`app/composables/useBotDriver.ts`** plays the bots' turns, and only on the
host's client (`seat === 0`) — two clients driving the same bot would emit and
apply every move twice. It goes through `sync.dispatch`, never through store
actions directly: dispatch applies locally, broadcasts and persists to
`game_events`, so a direct call would desync every other client and break replay.

Two transitions need it that the UI does not cover, because the UI only emits
them from the active player's own client, which a bot does not have: the roll in
`waiting_roll`, and `NEXT_TURN` in `turn_end`. Without those the game never
starts and then freezes at the end of a turn.

If the host closes the tab, the bots stop. The turn timer already auto-passes
players who have not acted, so the game keeps moving rather than blocking.

### Measurement protocol — read this before trusting any number

Agents were first tuned **single-agent** (one sheet, no opponent, 50-turn cap). That
framing ranks agents **wrongly at the top**: the best single-agent agent (38.88 solo)
finishes **last** at a 4-player table (15.11, 3.8% wins). Solitaire does not punish
stalling, because the agent alone decides when the game ends — so it learned to hoard all
8 jokers and pass 12 times a game.

`bots/playMulti.ts` implements the real game: dice denial (passive players only get the 4
remaining dice), the game ending when the first player completes two colours, and
first/others bonuses. **Tune and evaluate there** (`pnpm tune:multi`, `pnpm duel`).
`scripts/tune-v3.ts` and `scripts/eval.ts` are single-agent, kept as witnesses.

### Measured findings

Numbers come from `pnpm eval` (2000 paired games, 8 grids). Comparisons are paired: at equal game index every agent sees the same dice on the same grid, and the harness reports the paired delta with a 95% interval.

- CEM tuning is worth **+4.39 [+4.15, +4.63]** over hand-set weights, validated on disjoint holdout seeds.
- 2-ply expectimax: **+0.28 [-0.26, +0.82]** — not significant, for ~140x the cost. Dice are fully rerolled each turn, so one turn of lookahead adds nothing the position evaluation does not already capture.
- The 21-parameter heuristic (v2) is **-0.56 [-0.78, -0.33]** — a richer representation with *flat* counters does not help.
- The v3 heuristic is **+0.42 [+0.19, +0.65]** on the tuning seeds and **+0.72 [+0.50, +0.95]** on disjoint holdout seeds, for ~2x the cost. The difference from v2 is that its terms are gated by turn number. Passes per game fall 2.68 -> 1.98.
- Monte-Carlo rollouts with the tuned policy are the only thing that genuinely beats it: **+1.60 [+0.30, +2.90]** over 64 paired games, for ~3500x the cost.

All of the above is **single-agent** and therefore suspect. At a 4-player table (2000 games,
rotating seats): `v3-multi` 26.58 mean / 73.0% wins, `v3-sans-passe` 20.73, `greedy-cem`
16.81, and the solo champion last at 15.11. The winner is also the one that *finishes*
games (74.8% vs 2.5%) — speed is a strategy here, not a side effect.

**Dice denial** was implemented, measured and deliberately left out of the game.
`legalMovesByDicePair` in `engine/state.ts` exists for it: the normal generator merges
dice pairs that are equivalent *for the player*, which happens in over 8 turns in 10 and
throws away exactly the information that matters *for the opponents*. With opponent sheets
(public in the real game) an active player can price what a choice hands to the others.
Measured at a 4-player table, same weights throughout, 1600 games: **+1.69 [1.24, 2.13]**
and 19.7% -> 26.9% wins, with an interior optimum around 0.8-1.1 (denying too much also
hurts), for ~1.24 ms per decision. Not shipped: reading opponent sheets complicates the
in-game bot and a stronger opponent was not the goal. Code kept in
`bots/baselines/denial.ts`; `TurnContext` carries the optional `isActive` / `fullRoll` /
`opponents` fields it needs, which `playMulti` populates and other bots ignore.

Voluntary passing is a real option the move generator did not represent (`legalMoves`
treats passing as "no legal move"). Adding it was worth +1.51 solo — and is exactly what
sinks the agent in a real game. The multiplayer-tuned agent keeps the option but almost
never uses it.

Keep the negative results. They are measurements, not gaps.

### Key composables
- **`Usegamesync.ts`** — multiplayer sync (see above)
- **`Useturntimer.ts`** — countdown timer; on expiry the active player auto-passes any players who haven't acted
- Filename convention: capitalised `Use*.ts` (non-standard; Nuxt auto-import usually expects `useX.ts`). Keep the pattern when adding new ones to match existing imports.

### Timer logic
- Roll timer: 15s auto-roll if active player doesn't roll
- Turn timer: duration from `lobby.turnDuration` (default 60s); only the active player dispatches expiry actions to avoid duplicate events
