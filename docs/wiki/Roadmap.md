# Roadmap

The full requirements, design and task list are in `.kiro/specs/zombie-base-survival`. This page is the short version.

## Done

- **Setup and clock.** Vite, TypeScript, Three.js. A world clock that runs faster than real time, stops when the tab is
  hidden, and is tunable with `VITE_TIME_SCALE`. Saves in the browser with a backup copy.
- **The town.** A low-poly town on a flat ground with roads, shops and four plots.
- **Economy.** Shops and the online store, stock, panic buying from Day 20, returns, buying a plot and more land.
- **Building.** About 75 structures with real procedural models, placing from storage, a structure card on every placed
  piece, instant rotate and move, a crew that builds over time, fences and walls on grid lines.
- **Survival.** Hunger and thirst, wells, tanks, farms, power, connections with warning signs, and the advisor.
- **A living world.** Synthesised sound, traffic, day and night, weather, birds, fireflies.
- **Upkeep.** Wear, dirt, repairs, three upgrade levels, tools and materials.
- **Base Architect.** Analysis, a tested design for eight people, land planning, one-click build.
- **Views.** A full 360 degree turn, tilt, compass, utility view.
- **A big, streamed world and a walking player.** About ten times the old area, 1,280 m across, generated in chunks and drawn only
  near you. WASD walking with collision, a corner map and waypoints; click-to-travel is gone.
- **Vehicles.** Seven vehicles with fuel, wear, crashes, off-road limits, a dealership, parts and a trailer.
- **Looting.** After the outbreak every house can be searched once; goods have weight, and a backpack and vehicles carry them.
- **Speed control and returns.**
- **Cheats** that last for the session only, including teleports, vehicle and walking switches, and weather.
- **Seasons and weather.** Four 20-day seasons, rain, snow, thunderstorms with lightning, heatwaves and cold snaps, painted over the whole screen. Out in the open they cost health.
- **Clothes and a character.** A name and gender at the start; 18 clothes in five slots with warmth and dryness.
- **A title screen with profiles and save slots.** A welcome screen for the username and look, a main menu over the live town, three save slots, a survivor screen with a 3D turntable, and a guest account.
- **Accounts and cloud saves.** Sign in with Google (Firebase Auth), unique usernames, and games kept in the cloud (Firestore) with this browser as a cache; the newest save of each slot wins. Guests keep playing with local saves and can copy their games into an account.
- **Light at night.** Powered lamps, floodlights and fires light the ground around them.
- **Product sheets** for every product, and thumbnails cached in the browser.

## Next

- **Outbreak and zombies (M6).** Waves from Day 30 that go for the nearest barrier, with real-time movement. Barrier
  strength is already the structure's hit points, wear already lowers it, and the defence structures are already
  placeable.
- **Danger on supply runs.** Houses can already be searched. Zombies in them, noise from vehicles and engines, and injuries
  would make each trip a risk.
- **Performance and polish.** Measure on a real GPU, check offline use through the service worker.

## Later

- **The AI events director.** A language model that writes news, radio and events within a schema the game validates.
- **Hosting and account care.** Firebase Hosting for the game itself, deleting an account and its data from inside the game, and App Check.
- **People who live at the base.** Cabins and beds would add people, who would add needs and jobs.
- **Fatigue and sleep, hygiene and illness.** The fields exist; the rules do not.
- **Maps and multiplayer servers.** Several maps, and servers where up to four people play together. In progress: the plan and
  the state of each step are on the [Multiplayer design](Multiplayer-Design.md) page, and step 1 (every action as a command) is done. What is in place:
  the world is generated from a seed in chunks (the same coordinates always give the same chunk), the weather is a pure
  function of the seed and the clock, and the rules in sim do not touch the screen. A server would run sim as the one
  authority and send each player the chunks and changes near them, and the browser would become a client that sends
  inputs. Open questions: how saves work with several players, how much a player's cheats may touch, and how the world clock is shared when players want different speeds. This comes after the zombies.
- **Real 3D assets** (glTF packs under permissive licences) in place of the procedural models.
- **Harder rules for building.** For example, refusing to let non-survival buildings go up before food and water exist.

Ideas and bugs are welcome as GitHub issues.
