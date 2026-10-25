# Camera and views

The camera orbits the point in the middle of the screen. It is orthographic (no perspective), so size does not change
with distance.

## Turning and tilting

- **Turn** all the way round, 360 degrees: `Q` / `E` (hold), right-drag sideways, or the two round arrows in the top bar.
  The arrows turn a quarter-turn step to the next multiple of 45 degrees so you always land on a clean view.
- **Tilt** from 30 degrees (low, from the side) up to 88 degrees (nearly straight down): `Z` / `C` (hold), right-drag up
  and down, or the chevron buttons in the top bar. The default is 52 degrees.
- **Compass**: the needle points north. Click it to reset turn and tilt.
- Moving the map (`WASD`, drag) always follows the screen: up is away from you at every angle.
- The names of land edges in the **Buy more land** panel follow the turn.

### Why a square does not always look square

A square on the ground seen from an angle is a parallelogram, because the camera looks at it obliquely. At the default
corner view it is an even diamond, looking straight along a grid line it is a rectangle, and anywhere in between it is a
slanted parallelogram. This is the correct picture, not a bug. Tilt to 88 degrees and a square is a square from every
direction.

## Zoom

The wheel zooms toward the pointer, so the spot under the mouse stays put. The range runs from a close-up of a few
structures to a view of the whole district.

## Utility view

Power cables and water pipes are hidden by default, because a base full of lines is hard to read.

- Press `U` or the cable button to show all of them.
- They also show while you are placing something, so you can see reach.
- When you select a structure, its own network shows.

Cables are drawn as a spanning tree (the shortest set of runs that still joins everything), hung between the tops of
structures with a little sag, with amber lugs at each end. Pipes lie on the ground with square corners and a cap at each
joint. They are drawn from the same connections the simulation uses, so a missing line means a missing link.

## Day and night

The sun and moon move with the game clock, and the sky, lights, headlights and fireflies follow. Rain thins the light.
Cheats can lock the time of day and the weather (see [Cheats](Cheats.md)).
