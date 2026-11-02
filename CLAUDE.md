# Deadbolt (working title)

Original, Zombicide-inspired, cooperative, **asynchronous** web board game for Marcus and friends. Take a turn when you have time; the next player is emailed. Games can last months. One email can be in several games at once. Full design doc: https://claude.ai/artifact/7pFaaDsjdD2qTRHU71w255

## Layout

npm workspaces (`packages/*`, `apps/*`):

- `packages/engine` (`@deadbolt/engine`): pure TypeScript rules engine. No I/O, no DOM. Deterministic and replayable.
- `apps/web` (`@deadbolt/web`): Vite + React 18 + PixiJS 8 client. Currently hot-seat (one shared screen), autosaved to localStorage key `deadbolt-hotseat-v1`.
- `apps/server` (`@deadbolt/server`): Fastify API. `service.ts` holds all logic (auth, games, turns, host tools, email jobs); `app.ts` is thin routes; `store.ts` is a generic doc store (MemoryStore + optional JSON file); `mail.ts` is a console mailer. Games are seed + log, state cached on the game doc; clients get `redact()`ed state. Run: `npm run server` (env PORT, BASE_URL, DATA_FILE, JOB_SECRET).
- Planned: Neon Postgres store, Resend mailer, Render free hosting with an external cron hitting `POST /jobs/run` (header `x-job-secret`).

## Commands

```
npm install
npm test            # engine tests (vitest), ~76 tests
npm run typecheck   # engine
npx tsc -p apps/web/tsconfig.json   # web typecheck
npm run dev         # web dev server
npm run build       # web production build
npm run sim         # bot simulations (balance numbers)
npm run test:server # server tests (vitest)
npm run typecheck:server
npm run server      # dev API on :8787, mail printed to console
```

## Engine contract (do not break)

- `createGame({ seed, survivors: [{ charId, owner }] }) -> { state, events }`
- `applyAction(state, action, rng?) -> { ok: true, state, events } | { ok: false, error }`. Pure: it clones state and never mutates input. PRNG state lives in `state.rng` (mulberry32), so a game is fully reproducible from seed plus action list.
- `legalActions(state, seat)` dry-runs candidate actions through `applyAction`.
- The zombie phase runs automatically inside the last survivor's `end_turn`.
- `state.pending` holds a choice in progress (search: `resolve_search`).
- `RULES_VERSION` (`packages/engine/src/version.ts`) is pinned per game. Any rules change that alters outcomes must bump it and keep old games replayable.
- Errors inside rules use `fail(): never` (a function declaration, so TypeScript narrows).

## Rules summary (source of truth is the engine; the Rulebook tab in the web app is generated from engine data where possible)

- 2 to 6 players, pure co-op, 1 to 6 survivors total, a player may control several. Fixed survivor turn order. Zombie phase after the last survivor.
- Map: The Long Block, 15 zones (4 columns by 5 rows grid coords). Doors start locked except the Shop front door. First door opened in a building spawns a card per room. Line of sight: outdoor zones pass sight; entering an indoor zone stops it.
- 3 actions (+1 at level 1, +1 Dana's Plan B). Moving costs +1 per zombie in the zone you leave. Search: indoors, no zombies, once per turn.
- 5 inventory slots (2 hands). Dual wield, reload (sawed-off), combine (molotov, scoped rifle).
- Damage must meet toughness in one hit (Mutant toughness 3). A die hits on a roll >= weapon accuracy. Melee priority default sprinter > brute > mutant > shambler; ranged auto-order survivors (friendly fire) > shambler > brute > mutant > sprinter.
- Noise: tokens plus survivors count (Jonah's Light Step is silent). Zombies attack if a survivor is in the zone, else move toward the nearest visible survivor, else the noisiest reachable zone. Sprinters act twice.
- 2 wounds = down. XP levels at 7 / 19 / 43. Danger = max level of living survivors.
- Spawn deck (22 cards, in `data/spawn.ts`); shambler/sprinter counts scale by survivors in play via `SPAWN_SCALE = [0.5, 0.5, 0.75, 1, 1.25, 1.5]`. Brutes are not scaled.
- Win: keys + fuel + every living survivor at the East end + `start_truck`.
- Bot win rates (60 games, seed 100): 2 survivors 70%, 3: 83%, 4: 80%, 5: 73%, 6: 87%. Retune with `npm run sim` after any balance change.

## Web client notes

- `Board.ts`: Pixi `BoardView` (`create`, `update(state, hints, events, instant)`, `zoomBy`, `resetView`). Tweened retained tokens, pan/zoom, hover/tap tooltips.
- `Game.tsx`: React HUD driven by `legalActions`. Undo stack locks on dice, draws, hidden reveals, building opens, spawn events and end_turn.
- `Rulebook.tsx`: tabbed modal (lobby and in-game). Update the prose when rules change.
- Mobile: layout breakpoint 900px. Test with Playwright using `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.

## Roadmap

1. Engine: done.
2. Hot-seat web client with legend, goal panel, tooltips, hit chances, mobile pan/zoom, rulebook: done.
3. Server: slice 1 done (magic-link auth, invites, lobby/start, per-action validation by the engine, recap, nudges + host prompt, host skip/handover/transfer, job runner, 23 tests; console mail, memory store). Daily digest done (8 AM in the user's `tz`, set via PATCH /me, once per local day, only if others acted). Remaining: Postgres store (Neon), Resend mailer, web client talking to the API (replace hot-seat; search/dice resolve on the server, client undo only before random steps), deploy. Needs the user to create Neon and Resend accounts and pick hosting.
4. Polish: fuller phone layout, bigger bite/kill popups, sound.

## Conventions

- Keep the engine free of server and UI imports. The server must trust only the engine for legality.
- Add or update engine tests for every rules change; keep them deterministic (seeded).
- Files use LF line endings. If git shows whole-file changes on Windows, run `git config core.autocrlf false` and `git checkout -- .`.
- Windows note: do not run `pkill -f` on a string that appears in your own command line.
