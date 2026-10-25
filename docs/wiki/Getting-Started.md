# Getting started

## Install and run

You need Node.js 20 or newer.

```
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). Click **New Game**, or **Continue** if you have a save.

`.npmrc` sets `legacy-peer-deps=true` because one dependency is picky about peer versions. You do not need to do anything.

## Game speed

The world clock runs at `VITE_TIME_SCALE` game seconds for each real second. The default in `.env` is `24`: one game day
is one real hour. After changing it, restart `npm run dev`. Only the world clock is scaled: walking, combat and zombie
movement (when they arrive) always run at normal speed.

In the game you can fast-forward with the three buttons in the top bar (1x, 4x, 12x) or the `F` key. The speed is not
saved, so every load starts at 1x. It drops back to 1x by itself when something needs your attention: the outbreak
starts, the family gets thirsty or hungry, health drops, or a warning appears. It is held at 1x while you shop, place
things or travel.

The game has no pause button. The clock stops only while the menu (`Esc`) is open and while the tab is hidden.

## Your first ten minutes

1. You start in the **Roadside Motel** with $500,000 and four people.
2. Click **Hillside Realty** on the map and buy a base plot. Travelling on the map costs game time.
3. Click **Online store** (or press `B`). Everything arrives at once, free. Buy a well, a tank, a garden bed and seeds.
4. Open storage (`I`) and press **Place** on the well. Click your land.
5. Watch the **Advisor** panel on the left. It always shows the most important next step.
6. If you would rather not plan it all yourself, press `P` to open the [Base Architect](Base-Architect.md).

## Build and save

```
npm run build      # typecheck and build to dist/
npm run preview    # serve the build
```

The game saves to your browser (IndexedDB), about once a minute and when you leave the tab. Use **Save & exit to title**
in the menu for a clean exit. If a save is damaged, the game falls back to a backup copy.

The build registers a small service worker (`public/sw.js`) that keeps the game files and product pictures in the
browser so they are not fetched again.
