# Multiplayer design

Up to four players share one world and one base. A server owns the world and the browsers are clients. This page is the plan, and it says which parts are built.

## The plan

| Step | What | Status |
| --- | --- | --- |
| 1 | **Command layer.** Every player action is a plain-data command run by `applyCommand` (`src/sim/commands.ts`). | Done |
| 2 | **Headless server.** A Node process runs `src/sim` and owns one shared world. | Not started |
| 3 | **Clients.** Browsers send commands and walk or drive input, and draw the other players. | Not started |
| 4 | **Rooms and invites**, Firebase ID-token checks, saves kept on the server. | Not started |
| 5 | **Deploy** on the Oracle VPS (aarch64) behind Caddy with TLS, a process manager, backups and a memory limit. | Not started |

Single-player must work after every step. Steps 1 to 3 can be built and tested on one machine.

## Step 1: commands

A command is data such as `{ type: 'place', piece: 'wall', cx: 3, cz: 4, rot: 0 }`. `applyCommand(state, command)` runs the matching rule and returns that rule's own answer, `{ ok: true, ... }` or `{ ok: false, reason }`. The caller decides what the player sees: a toast, a sound, a redraw. That keeps the browser code out of the rules, so a server can run the same function.

Commands: `order`, `buyPlot`, `expand`, `returnItems`, `funds`, `place`, `move`, `rotate`, `remove`, `work`, `architect`, `wear`, `takeOff`, `enterVehicle`, `exitVehicle`, `cargo`, `vehicleJob`, `search`, `takeLeftovers`, `cancelSearch`.

Walking and driving are not commands. They are continuous input and will be sent as input frames.

The `architect` command carries no plan. The plan is worked out again from the state where the command runs, so a client cannot send a plan of its own.

`npm run test:headless` runs `tests/headless/smoke.ts`. It creates a game, runs commands and steps the clock in plain Node with no browser, which shows that the rules do not depend on the screen.

## Per-player state: the view swap

The rules read one `GameState`. Rather than rewrite them to take a player argument, the server will keep the shared world plus one record per player. While a command or a step runs for player P, P's fields are assigned onto the shared state object, the rule runs, and the fields are read back. The object is never replaced or copied, because `runtimeOf` and the loot search slot are keyed by that object. After a command the pack is read back from `state.pack`, because `cargo.ts` assigns a new one.

| Shared by everyone | Per player |
| --- | --- |
| money, storage, pieces, plot, expansion | position (`pos`) and place (`at`) |
| orders, stores, looted houses | backpack (`pack`) |
| time, phase, messages, calendar shift | outfit, wetness |
| vehicles | the vehicle being driven (`driving`) |
| seed and id counter | character (name, gender, look), the search in progress |

The family's `health`, `hunger` and `thirst` are shared.

## Rules that now live only in the browser

These sit in `src/main.ts` and must move into `src/sim` before a server can own them:

- `updatePlace`: working out `state.at` and unloading the pack at the base.
- The rule that cancels a search when the player walks away.
- Walking and driving speeds and the drive sub-stepping.
- Lightning damage, which is started from a render callback.
- `effectiveSpeed()` and `flushSurvival` (called from the UI refresh).
- The events director.

## Open questions

- Exposure damage with several players: each player's exposure against the shared health.
- A vehicle needs a `driver` field so two players cannot enter the same one.
- Notices (the "you are cold" kind) need to be per player.
- Cheats and fast-forward are off in multiplayer. What the game speed should be, and who sets it.
- `migrate` in `src/save/store.ts` is mixed with IndexedDB code and must be split out for the server to load saves.
- `world/collide.ts` holds the base's solid shapes in a module-wide variable (`setBaseSolids`). One server process holding several worlds needs that made per world.
- Any new `GameState` field must be added to `migrate`, which is a whitelist, with a `SAVE_VERSION` bump.

## The server machine

An Oracle Cloud VM, aarch64, 4 cores and 24 GB. Planned names: `zgame-server.omprakash.me` for the WebSocket server and, optionally, `zgame.omprakash.me` for the game page on Firebase Hosting.
