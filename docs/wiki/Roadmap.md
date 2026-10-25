# Roadmap

The full requirements, design and task list are in `.kiro/specs/zombie-base-survival`. This page is the short version.

## Done

- **Setup and clock.** Vite, TypeScript, Three.js. A world clock that runs faster than real time, stops when the tab is
  hidden, and is tunable with `VITE_TIME_SCALE`. Saves in the browser with a backup copy.
- **City and travel.** A low-poly town on a flat ground with roads, shops, four plots and a forest. Click to travel.
- **Economy.** Shops and the online store, stock, panic buying from Day 20, returns, buying a plot and more land.
- **Building.** About 75 structures with real procedural models, placing from storage, a structure card on every placed
  piece, instant rotate and move, a crew that builds over time, fences and walls on grid lines.
- **Survival.** Hunger and thirst, wells, tanks, farms, power, connections with warning signs, and the advisor.
- **A living world.** Synthesised sound, traffic, day and night, weather, birds, fireflies.
- **Upkeep.** Wear, dirt, repairs, three upgrade levels, tools and materials.
- **Base Architect.** Analysis, a tested design for eight people, land planning, one-click build.
- **Views.** A full 360 degree turn, tilt, compass, utility view.
- **Speed control and returns.**
- **Cheats** that last for the session only.
- **Product sheets** for every product, and thumbnails cached in the browser.

## Next

- **Outbreak and zombies (M6).** Waves from Day 30 that go for the nearest barrier, with real-time movement. Barrier
  strength is already the structure's hit points, wear already lowers it, and the defence structures are already
  placeable.
- **Supply runs (M7).** Trips out of the base to loot stores for food, fuel, and the tools and materials that repair and
  upgrade your base. Possibly with a vehicle that adds carrying capacity and speed but burns fuel and makes noise.
- **Performance and polish.** Measure on a real GPU, check offline use through the service worker.

## Later

- **The AI events director.** A language model that writes news, radio and events within a schema the game validates.
- **Cloud saves.**
- **People who live at the base.** Cabins and beds would add people, who would add needs and jobs.
- **Fatigue and sleep, hygiene and illness.** The fields exist; the rules do not.
- **Real 3D assets** (glTF packs under permissive licences) in place of the procedural models.
- **Harder rules for building.** For example, refusing to let non-survival buildings go up before food and water exist.

Ideas and bugs are welcome as GitHub issues.
