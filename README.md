# Deadbolt (working title)

An original, cooperative, asynchronous zombie board game for the web. Players take turns
whenever they have time; the next player is emailed. This repo currently contains **Phase 1**:
the pure TypeScript rules engine, the scenario "The Long Block", a bot, a terminal simulator
and tests. The board UI, server, accounts and email come in later phases.

## Layout

```
packages/engine      rules engine (pure, serializable, no I/O)
  src/data           items, survivors, spawn deck, scenario map
  src/               core, actions, zombies, turns, setup, apply, legal, bot, render
  src/cli/sim.ts     terminal simulator
  test/              Vitest suite
```

## Commands

```
npm install
npm test                                   # 76 tests
npm run typecheck
npm run sim -- --games 100 --players 4     # win rates with the greedy bot
npm run sim -- --games 1 --seed 3 --watch  # watch one game on an ASCII board
```

## Engine contract

```ts
createGame({ seed, survivors: [{ charId, owner }] }) -> { state, events }
applyAction(state, action)                           -> { ok, state, events } | { ok: false, error }
legalActions(state, seat)                            -> Action[]
runZombiePhase(ctx)                                  // runs automatically after the last survivor's end_turn
```

* `GameState` is plain JSON. The PRNG state lives inside it, so a game is fully reproducible
  from `createGame` options plus the ordered action list (the server's append-only log).
* `applyAction` never mutates its input. The server re-validates every submitted action.
* Events (`moved`, `attack`, `zombie_killed`, `zombie_moved`, ...) drive animation, recap and replay.
* Survivor turn order is fixed at game start (`survivors` array order).
* Pending decisions (a search with a choice to make) are in `state.pending`; only `resolve_search` is legal.
* Undo is a server concern: snapshot the state before each action and restore until `end_turn`,
  except after a dice roll or card draw (those are locked in).
* Each game is pinned to `state.rulesVersion`.

## Rules notes and simplifications

* Zones, not squares. Doors start locked; the Shop front door starts open (and that building is empty).
  The first time a building is opened every room draws a spawn card.
* Hits are 1 damage unless the weapon says otherwise, and damage must meet a zombie's toughness in one hit:
  Mutants (3) can only be killed by a Molotov, or Lena at Overrun with a shotgun.
* Zombie wounds are spread automatically (fewest wounds first, then fewest hits this phase).
  Roll-call-style grants allow only move / open door / attack.
* Plenty of ammo, Steady Aim and Second Wind reroll misses automatically.
* Keys and fuel belong to the group, not a survivor.
* Spawn volume scales with survivors in play (x0.5, 0.5, 0.75, 1, 1.25, 1.5 for 1 to 6 survivors).

## Balance (greedy bot, 60 games each, seed 100)

| Survivors | Win rate | Avg rounds |
| --- | --- | --- |
| 2 | 70% | 10.6 |
| 3 | 83% | 8.9 |
| 4 | 80% | 8.9 |
| 5 | 73% | 8.7 |
| 6 | 87% | 8.3 |

The bot is simple, so human groups should do somewhat better.
