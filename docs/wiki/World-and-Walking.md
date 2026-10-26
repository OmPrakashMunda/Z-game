# The world and walking

There is no click-to-travel any more. You are a person standing on the map, and you walk (or drive) everywhere.

## How big it is

The world is a square 1,280 m on each side, about ten times the area the first version had. In the middle is the hand-made
town (shops, the four plots, the motel). Everything outside the town is generated from a fixed seed, so it is always the
same world:

- **Roads.** A grid of main roads every 200 m and smaller roads between them. The two town roads carry on to the edge.
- **Houses.** Hundreds of houses (at least 300) stand beside the roads, each with a stable id, a type and an area. Types are bungalow,
  family house, villa, farmhouse and cabin. Their doors face the road.
- **Four kinds of country.** Town, suburbs, farmland (with fields and big farmhouses) and woodland (thick trees and cabins).
  The deep woods around the hidden clearing have no houses at all.
- **The edge.** The world ends in mist. You cannot walk the last 30 m.

## Only the nearby world is drawn

The world is cut into 80 m squares called chunks. Only the chunks within about 200 m of you exist as 3D objects. Walk
or drive and new ones are built a few at a time (never more than about 5 ms per frame) while the far ones are dropped.
Each chunk is rebuilt from its coordinates alone, so nothing is stored: the same house stands in the same place every
time, and the save only holds what you changed (which houses you searched, where your vehicles are, and so on).

The mist at the edge of the drawn area is the same mist that fades the edge of the world, so the loading never shows.

## Walking

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` or arrows | Walk. Up the screen is always forward, however the view is turned |
| `Shift` | Run |
| `Space` | Use: go in at a shop door, get in a vehicle, search a house |

You walk at 4.6 m/s and run at 8 m/s, in real time. The game clock still runs at its own speed, so the 4x and 12x buttons
make the world go by faster while you walk at the same pace. Walls, houses, props and trees stop you and you slide along
them. Trees on land you own are cleared, and do not block you either.

The camera follows you. Drag the map to look around: it lets go of you until you move again. The camera never wanders more
than 140 m from you, so it never looks at ground that is not drawn.

## Where you are

Where you stand decides everything that used to need a trip:

- **At a shop's door** (within 5 m) you are "at" that shop. Press `Space` to go in.
- **On or just beside your land** (within 6 m) you are "at your base". Placing, moving, taking down, repairing and
  upgrading all need this. The online store works from anywhere.
- **Anywhere else** you are outside. The top bar names the kind of country.

## The corner map and waypoints

The map in the bottom right shows the roads, houses, shops and plots around you, with north up. The button on it opens the
whole world. Click either map to set a waypoint. You can also click a shop or plot in the 3D view and press **Set waypoint**.

A waypoint shows as a pin in the world, a diamond on the map and a chip in the top bar with the distance. It clears itself
when you get within 6 m. After the outbreak, houses nobody has searched yet are bright on the map.

## Starting out

A new game starts at the motel door. Walk to Hillside Realty (about 115 m east along the main road), go in with `Space`
and buy your plot. Or get a bicycle first: see [Vehicles](Vehicles.md).
