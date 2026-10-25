# Upkeep and repairs

Everything you build wears out slowly. Looking after it takes tools and materials.

## Wear

Each structure loses a share of its full strength every day, depending on what it is made of. Roughly, over a month:

| Structure | Strength lost in 30 days |
| --- | --- |
| Tent | 60% |
| Chicken coop, generator | 30% |
| Wooden picket fence, sandbag wall | 24% |
| Wooden gate, garden bed, windmill | 21 to 24% |
| Log palisade, greenhouse, battery, hand well | 15 to 18% |
| Chain-link or barbed fence | 12% |
| Log cabin, solar panel, watchtower | 9 to 12% |
| Cinder-block wall | 6% |
| Steel plate wall | 4.5% |
| Reinforced concrete wall | 3.6% |
| Shipping container | 3% |
| Underground bunker | 2.4% |

Paths, trees, flowers, boulders, fire pits and ponds do not lose strength. The exact rates are in
`src/data/upkeep.ts`.

Wear never destroys anything by itself: strength stops at 3%. Zombies will attack the same strength later.

### What low strength does

- Machines, farms and water sources work at full output while strength is 50% or more. Below that they fade to 30% output
  at zero strength.
- Below 40% a **wrench** sign appears, and the structure shows up in the advisor.
- For walls and fences, strength is their hit points.

## Dirt

Some things also get dirty, from clean to fully dirty in:

| Thing | Days |
| --- | --- |
| Fish pond | 10 |
| Small pond | 12 |
| Solar panel, solar array | 14 |
| Large pond | 16 |
| Rain collector | 20 |
| Greenhouse | 30 |

Dirt over 30% starts to cut output, up to 70% at full dirt. Above 60% a **drops** sign appears.

## Repair

Open the structure card and press **Repair**. It restores full strength.

- Needs a **toolbox** in storage (not used up).
- Uses materials worth about 18% of the structure's price, scaled by how much is missing.
- Which materials depends on what it is made of:

| Made of | Materials |
| --- | --- |
| Wood | lumber, nails |
| Masonry (concrete, cinder block, bunkers, solid houses, ponds) | concrete mix |
| Metal (chain-link, gates, wells, tanks, containers, greenhouses) | steel sheets, screws |
| Electrical (panels, batteries, generators, poles, lights) | electrical wire, screws |
| Sandbags | sandbags |

## Upgrade

Press **Upgrade to level N** on the card. There are three levels. Each level adds:

- +35% strength,
- +15% output for machines, farms and water sources,
- 15% slower wear.

Cost: materials worth 30%, 50% and 70% of the price for levels 1, 2 and 3. It needs a tool you keep in storage: a **power
tool set** for wood, masonry and sandbag structures, or a **welding kit** for metal and electrical ones.

## Clean

Press **Clean** on a dirty structure.

- Ponds need a **shovel** (not used up).
- Solar panels, rain collectors and greenhouse glass need **1 pack of soap**.

## Tools and materials

All of these are sold in the hardware store and online now: toolbox, shovel, power tools, welding kit, lumber, nails,
screws, concrete mix, steel sheets, electrical wire, sandbags, soap. The plan is for supply runs to find them as well, once
supply runs exist. The Base Architect and the `GIVETOOLS` cheat bring a full set.

## Taking things down

A structure at 90% strength or better goes back to storage whole. A worn one is scrapped: you get back materials worth
about a quarter of its price times its strength, so taking it down and putting it up again is not a free repair. Moving
or rotating keeps the same structure, so those are always free.
