# Clothing and character

## Your character

**New Game** opens the character creator. Choose a name and **Man** or **Woman**. The look of the walking figure follows
the choice (the woman has long hair and a different shirt). The name and gender are saved with the game. Older saves get
a survivor called *Survivor*.

## The character panel

The panel on the left side, under your family's needs, shows the name. Click it to open it:

- **Warmth** and **dryness** of the whole outfit, as percentages.
- How the weather is treating you right now (fine, wet, cold, freezing, hot) and how much health it costs per hour.
- The five clothing slots: **Head**, **Body**, **Legs**, **Hands** and **Feet**. Click a slot to see what you can put on
  it, and press **Wear** or **Take off**.

Clothes are **not drawn** on the character. They matter through two numbers.

## Warmth and dryness

- **Warmth** keeps the cold out. A very warm coat is too hot in a heatwave.
- **Dryness** keeps rain and snow off. Dry clothes slow how fast you get wet and cut the health the rain takes.

Each slot counts in proportion to the body it covers: head 15%, body 40%, legs 20%, hands 10%, feet 15%.

| Item | Slot | Warmth | Dryness |
| --- | --- | --- | --- |
| Baseball cap | Head | 5 | 10 |
| Wool beanie | Head | 50 | 10 |
| Rain hat | Head | 10 | 70 |
| T-shirt | Body | 8 | 2 |
| Hoodie | Body | 35 | 8 |
| Jacket | Body | 50 | 30 |
| Raincoat | Body | 20 | 85 |
| Parka | Body | 90 | 60 |
| Jeans | Legs | 25 | 8 |
| Cargo pants | Legs | 30 | 15 |
| Rain pants | Legs | 15 | 80 |
| Thermal pants | Legs | 75 | 15 |
| Work gloves | Hands | 20 | 15 |
| Winter gloves | Hands | 80 | 35 |
| Sneakers | Feet | 10 | 8 |
| Hiking boots | Feet | 35 | 60 |
| Rubber boots | Feet | 15 | 90 |
| Winter boots | Feet | 85 | 70 |

A new character wears a t-shirt, jeans and sneakers. Full rain gear is about three quarters dry. A full winter set is about
80% warm.

## Where to get clothes

- The **hardware store**, **supermarket**, **farm supply**, **gun shop** and the **online store** sell them.
- Every house can hold some, so searching houses after the outbreak finds clothes (see
  [Looting and carrying](Looting-and-Carrying.md)).
- Each piece has a product sheet that shows where it is worn, its warmth and its dryness.

You can wear what is in your **backpack** anywhere. What is in **storage** can be worn only at your base. The piece you take
off goes back where it came from.

The `GIVECLOTHES` cheat puts one of everything in storage.

## In the code

`src/data/clothing.ts` (the table and `outfitStats`), `src/sim/outfit.ts` (`wear`, `takeOff`, `wearableOnHand`),
`src/ui/character-panel.ts`, and the creator in `src/ui/ui.ts` (`showCharacterCreator`). The save has `character`, `outfit` and
`wet` (save version 9).
