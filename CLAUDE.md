# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:3000
pnpm build        # Production build
pnpm preview      # Preview production build
pnpm generate     # Static site generation
```

No test runner is configured in this project.

## Architecture Overview

This is a Nuxt 4 multiplayer board game called "Encore!" — a dice + grid colouring game (inspired by *Encore/That's Pretty Clever*). Stack: Vue 3 + Pinia + Supabase + Tailwind CSS.

### Game rules summary
- 7×15 grid (105 cells), each cell has a **colour** (`g/y/b/p/o`) and optionally a **star**.
- Each turn, 3 colour dice + 3 number dice are rolled. Players pick one colour die + one number die to form a combo (colour × count).
- Players must check exactly `count` contiguous cells of the chosen colour, adjacent to their existing checked cells. First move must include column H (index 7).
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
- `players[]`: each player tracks `checkedCells`, `pendingCells`, `validCombos`, `colorBonus`, `columnBonus`, `jokersUsed`
- `phase`, `currentRoll`, `activePlayerId`, `turnNumber`
- Key actions: `rollDicesWithResult()`, `confirmActiveCombo()`, `confirmPassiveCombo()`, `togglePendingCell()`, `confirmPendingCells()`, `nextTurn()`
- Cell placement uses pre-computed `validCombos` (set on combo confirmation) filtered via `getSelectableCells()` on each click

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

**`app/utils/gameRules.ts`** — pure functions, no store dependency:
- `findAllValidCombos()` / `findPlacementCandidates()`: BFS + DFS to find all valid contiguous placements for a given (colour, count) combo
- `getSelectableCells()`: filters pre-computed combos by already-pending cells to show what's clickable next
- `validatePlacement()`: final validation before committing pending cells
- Grid is 15 columns wide; column H = index 7 (first move anchor)

### Supabase schema (3 tables)
- `games`: id, code (6-char), status, grid_id, max_players, turn_duration
- `game_players`: game_id, player_id, player_name, seat, is_ready
- `game_events`: game_id, turn_number, player_id, event_type, payload — append-only log used for replay on reconnection

### Pages
- `/` (`app/pages/index.vue`) — home: create or join a game
- `/game/[id]` (`app/pages/game/[id].vue`) — main game view; handles page-refresh reconnection by re-fetching from Supabase if lobby state is empty

### Key composables
- **`Usegamesync.ts`** — multiplayer sync (see above)
- **`Useturntimer.ts`** — countdown timer; on expiry the active player auto-passes any players who haven't acted

### Timer logic
- Roll timer: 15s auto-roll if active player doesn't roll
- Turn timer: duration from `lobby.turnDuration` (default 60s); only the active player dispatches expiry actions to avoid duplicate events
