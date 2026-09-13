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

**Retention: games inactive for 30 days are deleted nightly.** A `pg_cron` job
`purge-stale-games` runs `public.purge_stale_games()` at 03:17 UTC. The SQL is
kept in `supabase/purge_stale_games.sql`, with a dry-run query, verification
queries and how to undo it — like the rest of the schema it is otherwise
invisible from this repo.

- *Last activity* is a game's latest `game_events.created_at`, or its creation
  if it has none. Status is not used: the app never sets `finished`, so a
  completed game stays `playing` forever.
- Finished games also get the 30 days, so they stay reviewable on `/review`.
- `game_players` and `game_events` cascade on delete, so removing the game row
  is enough.
- **Security:** any function in `public` is callable by every visitor through
  the API. Execution is revoked from `public`, `anon` and `authenticated`
  (verified: only `postgres` can run it), and the function takes no parameter,
  so the delay cannot be lowered even if it were exposed. It is
  `security definer` with a pinned `search_path`.
- Do not run it by hand to "test" it: that is a real deletion in production. The
  selection is exactly the dry-run query in the SQL file.

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

### Post-game analysis (`analysis/`)

Judges a played move by putting the strongest policy in the player's seat with
exactly the player's information — their sheet, the opponents' sheets (public
by the rules), the current roll — and rolling the rest of the game out. Future
dice are drawn fresh, so the analysis never sees what the player could not.

Rollouts run through `continueMultiGame`, the real multiplayer loop resumed
from an arbitrary position. Single-agent rollouts would be wrong here for the
reason recorded above: that framing does not punish stalling, so it would
penalise a player for finishing fast.

Two estimator corrections, both measured, both of which would have shipped
wrong verdicts:

- **Selection bias.** Picking the best of several noisy means and scoring it
  against the played move on those same rollouts overstates the gap. It showed
  as a "loss" that shrank with the budget (3.52 at 4 rollouts, 1.34 at 16),
  which a real loss does not do. Selection and estimation now use disjoint
  halves of the seeds.
- **Variance.** Rolling to the end accumulates twenty turns of dice noise; the
  standard error per decision (1.4 to 4.6 points) dwarfed the whole-game
  advantage Monte-Carlo has over the heuristic. Truncating the rollout cuts it
  from 1.42 to 0.23 at a fifth of the cost.

**What the analysis can and cannot say.** Measured over all legal moves of real
decisions: the spread between best and worst is 3.49 points against 0.35 of
noise, a ratio of 10. So a clearly bad move is separable from a reasonable one.
But about **four moves per decision are statistically indistinguishable from the
best**, so there is no single best move to crown, and `analyseDecision` returns
the whole group of defensible moves instead.

**Negative result — the analysis does not rank near-equal players.** Four
strengths at one table (v3, two softmax temperatures, random), 20 to 45
decisions each, at horizons 3, 6 and 12: random separates every time (42-65% of
its moves fall outside the good group, against 5-40% for the rest), but the
three calibrated levels never order consistently, and the ordering flips between
horizons. That is noise, not bias — an earlier reading of a single horizon as
evidence of a myopia bias did not survive the sweep. The likely reason is
structural: softmax produces many small deviations rather than a few blunders,
so levels whose win rates differ fourfold are nearly indistinguishable move by
move. Judge moves, not players.

Cost, measured: 2.3 s per decision at horizon 3 with the two-stage budget,
4.0 s at horizon 6, 7.1 s at horizon 12, 17.8 s rolling to the end.

**Shipping setting: horizon 6, accusation threshold 2.0 points** (`DEFAULT_HORIZON`
and `DEFAULT_BANDS` in `analysis/verdict.ts`), chosen against a high-budget
full-rollout reference (`pnpm analyse:horizon`).

Two conditions must both hold before the tool reproaches anything: the gap must
clear the noise *and* exceed the threshold. Significance alone is not enough — at
a short horizon it is reached by gaps the reference considers unimportant, and
that is exactly how a correct move gets called a mistake.

The threshold is measured, and the first attempt to set it failed in an
instructive way. At horizon 6 a threshold of 1.5 looked perfect on the tuning
sample: all five bad moves caught, nothing falsely accused. On a disjoint seed it
produced **three false accusations out of fifteen**. It had been chosen on the
sample that scored it. At 2.0: no false accusation in 26 opportunities across
both samples, catching roughly half the genuinely bad moves. The 95% upper bound
on a 0/26 rate is still about 13%, so the honest claim is "none observed", not
"none possible".

Recall is the price, deliberately. The tool stays silent on moves it cannot
settle. Staying silent wrongly costs nothing; accusing wrongly discredits every
other verdict on the page.

Counter-intuitive and worth keeping: horizon 12 agreed with the reference more
often overall (81% against 69%) yet performed worse under a threshold, catching
two bad moves out of five where horizon 6 caught all five. Overall agreement is
the wrong indicator — what matters is the ordering near the accusation boundary.

**Never hand store state to the engine's hot loops.** `store.grid.cells` is a
Pinia reactive proxy, so every cell read goes through Vue's dependency tracking.
Rollouts read cells millions of times. Measured on one decision with the same
seeds: 30.6 s through the proxy, 2.0 s on a plain copy, identical verdict. That
single difference made the review page and the live review fifteen times slower
than the analysis scripts, which read `ALL_GRIDS` directly and so never showed
it. `replayDecisions` copies the cells once; a test asserts no replayed position
is a proxy, because nothing else would catch a regression that only costs time.

Two further boundary conversions the replay performs, both learned the hard way
on production data: store dice are `{ type, value }` objects where the engine
wants bare faces, and store bonus maps carry `null` for unclaimed entries and
key columns by letter, where the engine expects only claimed entries keyed by
index — passing the `null`s through would silently add 3 points per unclaimed
colour in every analysis.

**Verified end to end on a real game** (`0VITRI`, 96 events, 23 decisions), with
`analysis/__tests__/live-review.spec.ts` — skipped unless `GAME_ID`,
`SUPABASE_URL` and a public key are set; run it with `--disableConsoleIntercept`,
since vitest hides the console output of passing tests:

- every one of the 12 played moves is found among its position's legal moves;
- 98 s in total after detaching the cells from reactivity, against 1289 s before;
- 3.1 s per pass, 5.1 s per mid-game move, 4.2 s on average — the scripts' 3.4 s
  was low because they sample mostly early-game decisions, which have fewer
  candidates;
- the bot's verdicts are the ones the production page displayed (8 defensible,
  one mistake at turn 12, −2.06 in Node, −2.1 in the browser);
- a player who passed every turn was charged 4 mistakes out of 11, which is the
  right call: passing while good moves exist is a genuine error.

Automated checks of the page itself are unreliable in a hidden browser tab:
Chrome throttles timers there, so the `setTimeout(0)` yield between decisions
stalls and the main thread stays too busy to answer injected scripts. Verify in
Node; use the browser only for what Node cannot see.
