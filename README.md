# Z-Game

A single-player, browser-based zombie-apocalypse **base builder**. You have **30 days** to prepare. Buy land, stock up,
build a base that can feed, water and power your family, and be ready for the outbreak on **Day 30**.

Low-poly 3D on a flat ground, drawn with procedural models. Runs in any modern browser. Written in TypeScript with
[Three.js](https://threejs.org/) and [Vite](https://vite.dev/).

> Status: the preparation phase, a big walkable world, vehicles, looting, seasons and weather are playable. Zombies and base defence are not
> built yet. See the [roadmap](docs/wiki/Roadmap.md).

## Play it

You need [Node.js](https://nodejs.org/) 20 or newer.

```
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173), choose a username and a look on the welcome screen, then **Single player** and a save slot. See [the title screen](docs/wiki/Title-and-Profiles.md).

Other commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the game with live reload |
| `npm run build` | Typecheck and make a production build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Typecheck only |

The world clock runs at `VITE_TIME_SCALE` game seconds per real second (default `24`, so one game day takes one real
hour). Change it in `.env` and restart `npm run dev`. You can also fast-forward in the game with the 4x and 12x buttons.

## How a game goes
1. **Start at the motel** with $500,000 and a family of four, on foot in a world about 1.3 km across. Seasons turn every 20 days.
   Out in the rain your health slowly drops, snow and cold wear you down, and lightning is deadly: stay under cover in a storm,
   and wear warm, dry clothes (shown in the character panel on the left) when you must go out.
2. **Walk to Hillside Realty** (`WASD`, `Shift` to run, `Space` at the door) and buy a base plot: Old Farmstead, Warehouse
   Yard, Creekside Lot or Deep Woods Clearing. Click a place or the corner map to set a waypoint.
3. **Shop** at the shop doors or from the online store (instant, free delivery, 6% convenience markup). Things sell out and
   get dearer from Day 20 as people start to panic. **Rusty Wheels Autos** sells seven vehicles, from a bicycle to a box
   truck, and the parts that fit them.
4. **Build.** Stand at your base, open your storage (`I`), press **Place** and click your land. A crew of three builds over
   game time.
5. **Keep the family alive.** They need water and food every day. Build wells, tanks, farms and power. The advisor tells
   you what to do next and warning signs show what is broken.
6. **Look after it all.** Walls wear down, ponds silt up, panels get dusty. Repair, upgrade and clean with tools and
   materials.
7. **Day 30:** the shops close and the outbreak begins. Whatever you built and stored is all you have, until you **search
   the empty houses** for more. Carry it home on your back or in a vehicle.
Short on time? Press **P** for the **Base Architect**. It checks your base, designs a complete upgrade (crop belt, walls,
gate, cabins, water, power, watch posts), tests it on a copy of your game and builds it for you.

## Controls
| Key | Action |
| --- | --- |
| `W A S D` / arrows | Walk (up the screen is forward). While driving: gas, brake, steer |
| `Shift` | Run. While driving: handbrake |
| `Space` | Go in at a shop door, get in or out of a vehicle, search a house |
| Mouse wheel | Zoom toward the pointer |
| Left-drag | Look around (the camera comes back when you move) |
| `Q` / `E`, or right-drag sideways | Turn the view all the way round (360 degrees) |
| `Z` / `C`, or right-drag up and down | Tilt the view from the side to straight down |
| `I` `O` `N` | Storage, orders, news |
| `B` | Online store |
| `V` | Open storage to place something |
| `R` | Rotate what you are placing, or the structure you selected |
| `1` to `9` | Switch what you are placing |
| `P` | Base Architect |
| `U` | Show or hide power cables and water pipes |
| `F` | Fast-forward on or off |
| `M` | Mute |
| `` ` `` (backquote) | Cheat box |
| `Esc` | Stop placing, close a card, open the menu |
More in the [controls page](docs/wiki/Controls.md).

## Cheats

Press the backquote key and type a code. Type `HELP` to list them. Cheats last for the current session only: leaving the
game, reloading the page or loading a save switches them all off, and nothing about them is saved.

`NONIGHT` `NODAY` `NORAIN` `RAINALLDAY` `STORM` `SNOWFALL` `NOBUILDTIME` `NOCARS` `NOWEAR` `FREEREPAIRS` `GODMODE` `FREESHOP`
`FREEZETIME` `ENDLESSFUEL` `TOUGHCARS` `QUICKSEARCH` `FASTFEET` `NOCLIP` `BIGPACK` `TURBO`, and one-off codes `BUILDNOW` `MONEY` `SETMONEY n` `SKIPDAY` `SETDAY n` `FIXALL` `MAXUPGRADE` `GIVETOOLS`
STOCKUP FULLTANKS WOODSBASE SETSEASON name GIVECLOTHES. For moving around: `BACKTOBASE` `GOTO place` `GOTOHOUSE` `GOTOCAR` `CALLCAR`\n`GOTOWAYPOINT` `COORDS x z` `WHEREAMI` `GIVECAR type` `REFUELALL` `REPAIRCARS` `EMPTYPACK` `RESETHOUSES`. See the [cheats page](docs/wiki/Cheats.md).

## Documentation

The wiki pages live in [`docs/wiki`](docs/wiki/Home.md):

- [Getting started](docs/wiki/Getting-Started.md)
- [Controls](docs/wiki/Controls.md)
- [Gameplay guide](docs/wiki/Gameplay-Guide.md)
- [The world and walking](docs/wiki/World-and-Walking.md)
- [Vehicles](docs/wiki/Vehicles.md)
- [Looting and carrying](docs/wiki/Looting-and-Carrying.md)
- [Economy and shops](docs/wiki/Economy-and-Shops.md)
- [Building and placing](docs/wiki/Building-and-Placing.md)
- [Survival and utilities](docs/wiki/Survival-and-Utilities.md)
- [Weather and seasons](docs/wiki/Weather-and-Seasons.md)
- [Clothing and character](docs/wiki/Clothing-and-Character.md)
- [The title screen, profiles and save slots](docs/wiki/Title-and-Profiles.md)
- [Upkeep and repairs](docs/wiki/Upkeep-and-Repairs.md)
- [Base Architect](docs/wiki/Base-Architect.md)
- [Camera and views](docs/wiki/Camera-and-Views.md)
- [Cheats](docs/wiki/Cheats.md)
- [Architecture (for developers)](docs/wiki/Architecture.md)
- [Testing](docs/wiki/Testing.md)
- [Roadmap](docs/wiki/Roadmap.md)

The requirements, design and task list are in [`.kiro/specs/zombie-base-survival`](.kiro/specs/zombie-base-survival).

## Saves

The game saves to your browser (IndexedDB) about once a minute, after important actions, and when you leave the tab. There are three save slots.
Use **Save & exit to title** in the menu to leave cleanly. Saves stay on your computer. Cloud saves are planned.

## Credits

All models are generated in code from basic shapes, and no third-party models are used yet. Icons are from
[Lucide](https://lucide.dev/) (ISC licence). Fonts are Barlow and Barlow Condensed from `@fontsource`. See
`public/models/CREDITS.md`.
