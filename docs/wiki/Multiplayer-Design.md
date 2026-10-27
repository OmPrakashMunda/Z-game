# Multiplayer design

Up to four players share one world and one base. A server owns the world and the browsers are clients. This page is the plan, and it says which parts are built.

## The plan

| Step | What | Status |
| --- | --- | --- |
| 1 | **Command layer.** Every player action is a plain-data command run by `applyCommand` (`src/sim/commands.ts`). | Done |
| 2a | **Shared world in `sim`.** Per-player records, the view swap, movement rules moved out of the browser (`sim/players.ts`, `sim/movement.ts`). | Done |
| 2b | **Headless server.** A Node process runs `src/sim` and owns one shared world. | Not started |
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

The rules read one `GameState`. Rather than rewrite them to take a player argument, a `World` (`src/sim/players.ts`) keeps the shared state plus one `PlayerRecord` per player, up to `MAX_PLAYERS` (4). `withPlayer(world, id, fn)` assigns that player's fields onto the shared state object, runs `fn`, and reads the fields back. The object is never replaced or copied, because `runtimeOf` and the loot search slot are keyed by that object. After a command the pack is read back from `state.pack`, because `cargo.ts` assigns a new one.

| Shared by everyone | Per player |
| --- | --- |
| money, storage, pieces, plot, expansion | position (`pos`) and place (`at`) |
| orders, stores, looted houses | backpack (`pack`) |
| time, phase, messages, calendar shift | outfit, wetness |
| vehicles | the vehicle being driven (`driving`) |
| seed and id counter | character (name, gender, look), the search in progress |

The family's `health`, `hunger` and `thirst` are shared.

What `sim/players.ts` offers:

- `createWorld(state, hostId)`, `addPlayer`, `removePlayer`: a new player starts at the motel door with the starter clothes and an empty pack. A fifth player is refused.
- `runCommand(world, playerId, command)`: runs a command for a player. It refuses `funds` (cheats are off in a shared world) and refuses `enterVehicle` for a vehicle someone else is driving.
- `walkPlayer` and `drivePlayer`: one player's walking or driving input for a stretch of time. They also work out where the player now is and cancel a search they have walked away from.
- `stepWorld(world, realDt, worldDt)`: the clock and everything shared run once, for the first player's view. Each other player's weather exposure and search time run on their own view. An empty world does not move.

`sim/movement.ts` holds the walking and driving rules that used to live in `main.ts`: speeds, collision, drive sub-stepping, working out `at`, and unloading the pack at the base. The browser calls the same functions as the server will.

`tests/headless/players.ts` checks all of this in plain Node: separate positions, packs, clothes and searches, shared money and clock, the four-player limit and one driver per vehicle.

## Rules that still live only in the browser

Walking, driving, working out the place and cancelling a search have moved into `src/sim`. These still sit in `src/main.ts` and must move before a server can own them:

- Lightning damage, which is started from a render callback.
- `effectiveSpeed()` and `flushSurvival` (called from the UI refresh).
- The events director.

## Open questions

- Exposure damage with several players: `stepWorld` runs each player's exposure against the shared health, so cold or rain hurts the family faster the more players are outside. Whether to average it instead is undecided.
- The player's save slot: a saved game holds one player's fields. How a shared world is saved (the state plus every record) is part of step 4.
- One driver per vehicle is enforced by `runCommand`, which looks at the other players' `driving`. Nothing is added to the save for it. Passengers (a vehicle has seats) are not handled.
- Notices (the "you are cold" kind) need to be per player.
- Cheats and fast-forward are off in multiplayer. What the game speed should be, and who sets it.
- `migrate` in `src/save/store.ts` is mixed with IndexedDB code and must be split out for the server to load saves.
- `world/collide.ts` holds the base's solid shapes in a module-wide variable (`setBaseSolids`). One server process holding several worlds needs that made per world.
- Any new `GameState` field must be added to `migrate`, which is a whitelist, with a `SAVE_VERSION` bump.

## The server machine

An Oracle Cloud VM running Ubuntu, aarch64, 4 cores and 24 GB. Several other websites already run on it, so ports 80 and 443 are taken. DNS for `omprakash.me` is on Cloudflare. Planned names: `zgame-server.omprakash.me` for the WebSocket server and, optionally, `zgame.omprakash.me` for the game page on Firebase Hosting.

Two ways to publish the server without disturbing the other sites (decided at step 5):

1. **A new virtual host on the existing web server.** The existing nginx, Apache or Caddy gets one more block for `zgame-server.omprakash.me` that proxies WebSocket traffic to the game server on a local port. No new public port, and the certificate comes the same way as for the other sites.
2. **Its own port.** The game server listens on a separate port, with Cloudflare in front. Cloudflare's proxy only passes certain ports, and 8443 and 2053 are among those that allow WebSockets. The port must be opened in the Oracle security list and also in the Ubuntu firewall (`iptables`), because Oracle's Ubuntu images block it there by default.

The browser needs a `wss://` address, so the server needs a TLS certificate in either case.
