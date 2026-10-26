# Testing

The game is tested in a real browser. The scripts in `tests/e2e` open the dev server in headless Chrome, click and type
like a player, and also call the simulation directly through the dev hooks (`window.__game`). They are plain Node scripts
that print `PASS` or `FAIL` per check.

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
| `e2e` | 18 | Title screen, new game, the clock, walking to shops, waypoints, buying a plot, saving and resuming |
| `world` | 28 | World size, houses and ids, chunk streaming, walking, collision, the edge, cleared land, the corner map, saving the position, old saves |
| `vehicles` | 45 | The seven vehicles, buying, getting in and out, speed and surfaces, fuel, crashes, parts, repairs, a trailer, cheats, saving |
| `loot` | 29 | Searching houses, loot that is the same every time, the backpack, leftovers, vehicles taking the load, the cargo panel, saving |
| `build` | 23 | Online store, orders, the storage list, placing, dragging lines, refusals, crew build times, clicking a structure, take down, save and reload |
| `models` | 7 | Finished models stand on the ground; blueprints are never squashed |
| `land` | 20 | Product pictures, landscaping, buying more land, building on new land, save |
| `woods` | 7 | Trees are cleared around bought land; the long walk to the woods |
| `lifecycle` | 30 | Prices and stock through the 30 days, panic, the outbreak, closing shops |
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

- Right after an edit, the dev server may reload the page under a running test. Do not edit while tests run.
- Pressing `Esc` with nothing open opens the pause menu, and the menu ignores clicks. Tests press `Esc` only when
  something is open.
- Tests that jump past Day 30 start the outbreak, which cannot be undone in that game.

## Not tested yet

- Frame rates on a real GPU.
- Offline use through the service worker.
- Audio.
