# Testing

The game is tested in a real browser. The scripts in `tests/e2e` open the dev server in headless Chrome, click and type
like a player, and also call the simulation directly through the dev hooks (`window.__game`). They are plain Node scripts
that print `PASS` or `FAIL` per check.

## Headless test

`npm run test:headless` runs `tests/headless/smoke.ts` with `tsx`. It starts a game, runs commands through `applyCommand`, steps the clock and round-trips the state through JSON, all in plain Node. It is quick, and it fails if a rule starts to need the browser. The server will depend on this.

## Running

```
cd tests\e2e
npm install
cd ..\..
pwsh tests\e2e\run.ps1                    # all scripts, about half an hour on a slow machine
pwsh tests\e2e\run.ps1 -Only cheats,build # some of them
```

`run.ps1` starts `vite` on its own port, runs each script, prints a table, and stops the server. It exits with 1 if any
check failed. Set `CHROME_PATH` if Chrome is not in the usual place.

Besides the browser tests, always run `npm run build`, which typechecks and builds.

## What each script covers

| Script | Checks | Covers |
| --- | --- | --- |
| `cloud` | 21 | Sign-in, claiming a profile, unique usernames (also in other letters), offering guest games, cloud slots and where each game is kept, newest save wins, a failed cloud save, deleting from the cloud |
| `title` | 45 | The welcome screen and username, the main menu, profile, settings, the three save slots, the survivor screen, deleting, older saves | walking to shops, waypoints, buying a plot, saving and resuming |
| `e2e` | 18 | Starting a game, the clock, walking to shops, waypoints, buying a plot, saving and resuming |
| `world` | 34 | World size, houses and ids, chunk streaming, walking, collision, the edge, cleared land, building collision (fence, gate, house, path), the corner map, saving the position, old saves |
| `gamepad` | 37 | A fake controller: menus with the D-pad and A and B, walking, the dead zone, running, turning and tilting the view, zoom, getting into a vehicle and driving with the triggers, the pause menu, lists and the store, and that the keyboard and unplugging still behave |
| `vehicles` | 52 | The seven vehicles, buying, getting in and out, speed and surfaces, fuel, crashes, parts, repairs, a trailer, cheats, saving |
| `loot` | 29 | Searching houses, loot that is the same every time, the backpack, leftovers, vehicles taking the load, the cargo panel, saving |
| `build` | 23 | Online store, orders, the storage list, placing, dragging lines, refusals, crew build times, clicking a structure, take down, save and reload |
| `models` | 7 | Finished models stand on the ground; blueprints are never squashed |
| `land` | 20 | Product pictures, landscaping, buying more land, building on new land, save |
| `woods` | 7 | Trees are cleared around bought land; the long walk to the woods |
| `lifecycle` | 30 | Prices and stock through the 30 days, panic, the outbreak, closing shops, sound, a storm with thunder |
| `survival` | 45 | Food, water, power, farms, links, warning signs, the advisor |
| `product-sheet` | 20 | The product sheet for every product |
| `speed` | 24 | 1x, 4x, 12x, the F key, holding speed while busy, slowing down on warnings, returns |
| `zoom` | 8 | Zooming toward the pointer |
| `view-turn` | 21 | Turning the view, the compass, keys, right-drag, walking at every angle, land edge names |
| `view-tilt` | 17 | Tilting, limits, reset, squares stay square straight down |
| `architect` | 19 | Planning on four plots, build, finishing, running by itself for 8 people |
| `architect-ui` | 11 | The Architect panel, sandbox funds, build button |
| `woodsbase` | 16 | The `WOODSBASE` cheat: land, a finished base, 14 days of survival |
| `cheat-box` | 13 | Opening the cheat box, typing safely, `BUILDNOW`, `MONEY` |
| `cheats` | 43 | Every cheat, and that cheats end with the session (title screen and reload) |
| `cheats-move` | 33 | The movement cheats: BACKTOBASE, GOTO, GOTOHOUSE, COORDS, GIVECAR, CALLCAR, FASTFEET, NOCLIP, BIGPACK, TURBO, and that they end with the session |
| `weather` | 51 | Seasons, weather as data, rain over the whole screen, lightning, health lost to rain, cold, heat and lightning, shelter, clothes and the character panel, lamp light at night, saving |
| `interact` | 43 | Placing from storage, the structure card, rotate, move, wear, repair, upgrade, clean, scrap, cables and pipes |

The counts are what passes today. If you add a check, update the number here.

## How the tests are written

- Each script starts with a helper `check(name, ok, info)` that prints one line.
- Game state is set up with the dev hooks (`give`, `setMoney`, `ownPlot`, `placeDone`, `skipToDay`, `advanceHours`) so the
  tests do not depend on long play. `survivalOff(true)` turns hunger and thirst off for tests that jump through time.
- Clicks on the map use `window.__game.project(x, z, height)` to turn a map position into a pixel.
- Long walks are done with `teleport(x, z)` and `teleportTo(place)`; `walk(dx, dz, seconds)` and `drive(throttle, steer, seconds)`run
  the real movement and collision rules without keys or frames. Tests can also `import('/src/world/gen.ts')` (and other modules) inside
  the page to read the game's own data.
- Waits are generous because headless Chrome without a GPU draws only a few frames a second. A key held for half a second
  may be seen by no frame at all, so tests hold keys for a few seconds.
- Time moves at 24x, so a long wait in the test is a lot of game time. Compare with tolerances, not exact numbers.

## Known awkward spots

- Every test starts a game with `newGame(page)` from `tests/e2e/helpers.mjs`, which goes through the real title screens (the username on the first visit, **Single player**, slot 1, **New game**, **Start game**). `continueGame(page)` opens the game in slot 1 again.
- Headless Chrome has no GPU, so two browser tests at once make each other slow. Walking and timing checks can then fail for no real reason; run those one at a time.
- `run.ps1` sets `VITE_FIREBASE_DISABLED=1`, so the tests always run as a guest, whatever `.env.local` says. If you start the dev server yourself and run a script by hand, set the same variable (or move `.env.local` aside), or the `title` test will find the sign-in button switched on.
- `gamepad.mjs` has no real controller to use, so it replaces `navigator.getGamepads()` with a fake one that it moves by hand, in the standard layout. A real controller at 60 frames a second is also read every frame, but headless Chrome draws only a few frames a second, so the test holds each button long enough to be seen.
- `cloud.mjs` swaps Firebase for an in-memory stand-in (`useBackend`), so it tests the game's behaviour without Google. The security rules are checked against the real project instead: an unauthenticated request to `users/...`, `users/.../saves/...` or `usernames/...` (read or write) must get `403 PERMISSION_DENIED`.
- Weather tests take over the sky with `setWeatherOverride` (or `setRain`) so the real weather does not change the result. `survivalOff(true)` also switches off weather damage.
- Right after an edit, the dev server may reload the page under a running test. Do not edit while tests run.
- Pressing `Esc` with nothing open opens the pause menu, and the menu ignores clicks. Tests press `Esc` only when
  something is open.
- Tests that jump past Day 30 start the outbreak, which cannot be undone in that game.

## Not tested yet

- Frame rates on a real GPU.
- Offline use through the service worker.
- Audio.
