# Looting and carrying

Before the outbreak the houses are people's homes and you cannot go in. After Day 30 they are empty, and every one of
them can be searched once.

## Searching

Stand at a house's door (the front, a little off-centre; the prompt says "Search the bungalow") and press `Space`.

- A search takes **6 to 15 game minutes**, depending on the size of the house. A bar shows the progress. The 4x and 12x
  speeds make it quicker in real time.
- **Walking off, or getting into a vehicle, stops it.** Nothing is found, and you can start again.
- When it finishes you carry the goods away, the news log says what was found, and the house is marked as searched. The
  corner map shows searched houses dark and the others bright.
- A house can be searched only once. Some (about one in ten) have already been picked clean.

## What is inside

What a house holds is worked out from its id and the game's seed alone (`src/sim/loot.ts`), so it is always the same:

- **Type.** Bungalows hold pantry goods and household things. Family houses add a garage (fuel, spare parts). Villas hold
  more medicine and tools. Farmhouses hold fuel, seed, feed and tools. Cabins hold tools, building materials and hunting
  gear.
- **Distance.** The further a house is from the town, the better its quality, so a long trip pays.
- Items come from the same list the shops sell (food, water, medicine, tools, fuel, seeds, spare parts, a few weapons).

## Carrying

Everything has a weight (`src/data/weights.ts`: a case of cans is 12 kg, a fuel can 17 kg, a sheet of lumber 70 kg).

- **On foot** you carry up to **25 kg** in your backpack. The top bar shows what you carry.
- **A vehicle beside you** (within 18 m) takes the goods first, up to its cargo limit.
- **What does not fit stays in the house.** Come back when you have room: the door then offers "Take the rest".
- **At your base** the backpack empties into storage by itself as you arrive. A vehicle's cargo is moved by hand.

Structures, buildings and vehicles are never carried: they are delivered or parked.

## Loading a vehicle

At your base, click the vehicle and press **Cargo: load and unload**. The panel shows how full it is, what is in it and
what you could load from storage. You can also keep spare fuel cans and spare parts in a vehicle: they are used for
refuelling and repairs when you are away from home. Away from the base the panel shows the load but cannot move goods.

## Cheats

`QUICKSEARCH` makes searches take no time. See [Cheats](Cheats.md).
