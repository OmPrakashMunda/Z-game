# Survival and utilities

## What the family needs

Four people share one set of needs.

| Need | Per person per day | From full to empty with none |
| --- | --- | --- |
| Water | 3 litres | about 36 hours |
| Food | 3 meals | about 72 hours |

So the family drinks 12 litres and eats 12 meals a day. Meters refill by 10 points an hour once the need is met. If
thirst is empty the family loses 5 health an hour, if hunger is empty 1.5 an hour, and health comes back 0.8 an hour when
both are fine. A low supply (under 2.5 days) raises a warning.

When you move in you get a starter pack of 3 cases of canned food and 2 of bottled water.

### Food

Meals come from stored food or from farms. The family eats fresh food first. One case of canned food is 24 meals; a
bag of rice is 100.

| Farm | Meals | Every | Water | Needs |
| --- | --- | --- | --- | --- |
| Raised garden bed | 18 | 5 days | 20 L/day | 1 bundle of seeds per crop |
| Greenhouse | 42 | 5 days | 40 L/day | 2 bundles |
| Large greenhouse | 84 | 5 days | 70 L/day | 3 bundles |
| Fruit orchard plot | 72 | 10 days | 30 L/day | nothing |
| Fish pond | 24 | 4 days | none | nothing |
| Chicken coop | 18 | 4 days | 8 L/day | 1 sack of animal feed |
| Apple tree | 6 | 8 days | none | nothing |
| Beehive | 6 | 7 days | none | nothing |

A farm that lacks seeds, feed or water shows a warning sign. **Seeds are used up and cannot be grown**, so a base that
should last after the shops close needs orchards and fish ponds.

### Water

| Source | Litres an hour | Needs |
| --- | --- | --- |
| Hand-pump well | 12 | nothing |
| Drilled deep well | 60 | power (0.6 kW) |
| Windmill pump | 20 (less when calm) | wind |
| Rain collector | 4 | raw water, needs a filter |
| Ponds | 10 / 25 / 15 (small, large, fish) | raw water, needs a filter |
| Old well on the Old Farmstead | 3 | nothing |

**Raw** water is fine for crops but not for drinking. A **water purification station** (40 litres an hour, 0.3 kW) cleans
the raw water in its network.

Tanks store 1,000 litres (water tower 5,000). Water that nothing can store is drunk straight away. Crops take raw water
first, then clean flow, then the tanks.

### Power

| Source | kW at full output |
| --- | --- |
| Solar panel | 0.35, by day |
| Solar array (6 panels) | 2.1, by day |
| Wind turbine | 1.2, when it blows |
| Generator 5 kW / 10 kW | 5 / 10, burns fuel and is loud |

A battery bank holds 12 kWh. Things that use power: lamp posts (0.08 kW, dark only), floodlight towers (0.4, dark only),
electric fences (0.15), the medical station (0.2), the radio mast (0.3), the deep well (0.6), the filter (0.3).

Generators burn 0.35 litres of fuel per kWh, only when something needs power and the batteries are empty.

## How things connect

Power and water each form **networks**. Two pieces join when the gap between them is within the larger of their reaches
and at least one of them is a **conductor** (a source, a tank, a battery, a power pole or a pipe junction). Plain machines
and farms plug into a conductor but never into each other.

| Piece | Reach |
| --- | --- |
| Power pole, pipe junction | 14 m |
| Water tower | 8 m |
| Wells, tanks, ponds, collectors | 6 m |
| Power sources and batteries | 5 m |
| Machines, lamps, garden beds | 3 m |

If something is not joined, it shows a sign and the card says what to do. Put a pole or junction in between.

Cables and pipes are drawn as a tidy tree: cables hang between the tops of structures, pipes lie on the ground with square
corners. They are hidden until you want them: press `U`, select a structure, or place something. See
[Camera and views](Camera-and-Views.md).

## The advisor

The advisor reads the base and lists steps in order of how fast the family would die without them: plot, water, tank,
food, pantry, power, shelter, walls. It offers buttons that buy and place things for you. Alerts appear for thirst,
hunger, low supplies and the first few broken structures.
