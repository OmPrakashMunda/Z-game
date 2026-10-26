# Architecture

Z-Game is a TypeScript single-page app built with Vite. Three.js draws the world; everything else is plain DOM.

```
src/
  main.ts            Wires everything together: game loop, input, screens, save and load, dev hooks
  cheats.ts          Cheat codes (session-only)
  config.ts          Reads VITE_TIME_SCALE
  input.ts           Keyboard: held keys (walk, turn, tilt) and single presses
  style.css          The whole look of the UI
  data/              Plain tables: no logic that touches the game state
    balance.ts         Tunable numbers (money, days, crew size, prices)
    city.ts            The hand-made town: roads, shops, plots, props, the dirt road; world size
    vehicles.ts        The seven vehicles and the parts that fit them
    weights.ts         How heavy things are; the backpack size
    items.ts           Supplies, plus every structure as a product
    stores.ts          What each shop (and the online store) stocks
    structures.ts      Every placeable structure: size, price, strength, build time, look
    survival.ts        Family needs; power, water and farm specs for each structure
    upkeep.ts          Wear rates, dirt, repair and upgrade materials
    info.ts            Product sheet text, derived from the tables above
  sim/               The game rules. Pure functions on a plain-object GameState; no DOM, no Three.js
    state.ts           GameState and the save version
    clock.ts           Day, hour, daylight
    step.ts            One simulation step: restock, build, wear, survive, deliver, outbreak
    economy.ts         Prices, panic, stock, orders, returns, sandbox funds
    realty.ts, land.ts Buying a plot and extra land
    build.ts           Grid, placement rules, edge pieces, take down, rotate, move
    utilities.ts       Power and water networks, and the runtime notes (not saved)
    survival.ts        Needs, power, water, farms, summary of the base
    upkeep.ts          Wear, repair, upgrade, clean
    advisor.ts         The "what to do next" list
    architect.ts       Base analysis, layout, land planning, test run, build
    places.ts          Where the player is: at a door, at the base, or outside
    vehicles.ts        Owned vehicles: driving, fuel, crashes, repairs, parts, parking, delivery
    cargo.ts           The backpack and a vehicle's load: picking up, loading, unloading
    loot.ts            What is inside each house, doors, and the search itself
  world/             The generated world outside the town (no graphics code)
    gen.ts             Roads, houses, fields and trees for each 80 m chunk, from a fixed seed
    collide.ts         What is solid near a point; moving a walker with sliding
    clearing.ts        Trees cleared around land you own (read by drawing and by collision)
  render/            Three.js
    scene.ts           Renderer, camera (follows the player), picking, highlights, cables and pipes
    streamer.ts        Builds and drops the chunks near the player; moves the mist at the edge
    forest.ts          Trees, bushes and rocks as instanced meshes, one set per chunk
    vehicles.ts        Vehicle and trailer models, wheels, one layer for all of them
    structures.ts      Procedural models for each structure
    models.ts          Shared model parts
    lines.ts           Fence, wall and hedge geometry
    merge.ts           Merges static models by vertex colour to cut draw calls
    atmosphere.ts      Clouds, birds, fireflies, rain
    traffic.ts         Cars and traffic lights
    badges.ts          Warning signs
    edgefade.ts        Mist at the edge of the forest
    thumbnails.ts      Product pictures rendered from the 3D models
  ui/                DOM panels (no framework)
  audio/             Web Audio synthesis (no audio files)
  save/store.ts      IndexedDB save slot with a backup copy and migration
  director/          Placeholder for the AI events director (later)
public/sw.js         Service worker: caches game files and pictures
.kiro/specs/         Requirements, design and tasks
docs/wiki/           These pages
```

## Layers and rules

- **`sim` knows nothing about the screen.** It reads and writes `GameState` only. That is why tests can call it straight
  from the browser and why saving is just JSON.
- **`render` and `ui` read the state and draw it.** They never change it, except through functions in `sim`.
- **`main.ts` is the only place that connects them.** It owns the current `GameState`, calls `stepSim` at a fixed 20 Hz,
  and calls the renderer every frame.
- **Data lives in `data/`.** Add a structure or an item there, not in the logic. The product sheets, store listings and
  thumbnails pick it up.

## Time

The clock advances `simStep x timeScale x speed` game seconds per fixed step. `stepSim` runs, in order: daily restock,
construction, wear, survival, searching, deliveries, and the outbreak check. Walking and driving are not part of `stepSim`:
they run once per frame in real time (`updateMovement` in `main.ts`), and only change `state.pos` and the vehicle.

## State that is saved and state that is not

`GameState` is saved. The **runtime notes** (`runtimeOf(state)` in `sim/utilities.ts`) are not: the connection graph, the
problems found on each structure, the power each network could meet, a testing switch, and the cheat switches. They are
kept in a `WeakMap` keyed by the state object, so loading a game starts with clean notes. Cheats rely on this.

Saves are versioned (`SAVE_VERSION`). New fields are optional where possible (`Piece.upgrade`, `Piece.dirt`), so older saves
load without a bump. When the shape really changes, bump the version and fill the field in `save/store.ts`.

## The world, chunks and walking
- ``src/data/city.ts`` holds the hand-made town (``TOWN_HALF`` = 88 m, the shops, plots, props, the dirt road) and ``WORLD_HALF``
  (640 m). Everything else comes from ``world/gen.ts``.
- ``getChunk(cx, cz)`` returns the roads, houses, fields and trees of one 80 m square. It is pure: the same coordinates give the
  same chunk. Houses are placed on a lattice beside each road, so a house has the same id (``hx200_3_p``) however it is
  reached, and ``houseById`` rebuilds one from its id. Chunks are kept in a small cache.
- ``render/streamer.ts`` builds the chunks within 200 m of the player (at most about 5 ms of work per frame, nearest first) and
  drops them past 280 m. The mist rectangle in ``edgefade.ts`` follows the loaded area, so loading is hidden.
- ``state.pos`` is the player. ``state.at`` is worked out from it every frame by ``sim/places.ts`` (``locate``): a shop door
  within 5 m, your land within 6 m, or ``outside``. The rest of the rules keep reading ``state.at``.
- ``world/collide.ts`` gives the solid boxes near a point (town buildings and props, houses, tree trunks that have not been
  cleared). Walking and driving both use it.
- ``state.vehicles`` are the owned vehicles and ``state.driving`` the one being driven. ``driveStep`` in ``sim/vehicles.ts``
  moves it; the player's position follows.
- ``state.pack`` is the backpack and ``state.looted`` the searched houses. A search in progress is a runtime note, not saved.

## Grid and pieces

The base grid has 2 m cells counted from the corner of the original plot. Cells can be negative once land is bought to the
north or west. A `Piece` is `{ id, type, cx, cz, rot, hp, maxHp, progress, level?, growth?, upgrade?, dirt? }`.

Cell pieces fill `w x d` cells from `(cx, cz)`. **Edge pieces** (fences, walls, sandbag walls, gates) fill no cells: they lie
on grid lines, where `(cx, cz, rot)` is the start of the segment. Even `rot` runs along x on the line `z = cz`; odd `rot`
runs along z on the line `x = cx`. Corner posts are owned by one piece per corner.

## Dev hooks

`npm run dev` exposes `window.__game` (state, `skipToDay`, `placeDone`, `give`, `setMoney`, `advanceHours`, `summary`,
`issues`, `scenery`, `turnView`, `tiltView`, `teleport`, `teleportTo`, `player`, `walk`, `giveVehicle`, `drive`,
`loot`, `world` and more). They are used by the tests and are not in the production build.

## Adding things

- **A structure:** add a row to `STRUCTURE_LIST` in `data/structures.ts`, a model in `render/structures.ts`, utility specs in
  `data/survival.ts` if it produces or uses power, water or food, and a wear row in `data/upkeep.ts`.
- **A supply item:** add a row to `BASIC_ITEMS` in `data/items.ts`, stock in `data/stores.ts`, and text in `data/info.ts`.
- **A cheat:** see [Cheats](Cheats.md#adding-a-cheat).
- **An icon:** import it in `ui/icons.ts` and add it to the registry. The game fails fast on an unknown icon name.

## Rules of the house

- No emoji anywhere in the game; icons are Lucide SVGs.
- No non-ASCII characters in source literals; use escapes such as `\u00B7`.
- `noUnusedLocals` is on.
- Everything is drawn in code. Keep it low-poly.
