# Weather and seasons

The sky is part of the rules. Weather soaks and chills you, heat makes you thirsty, and lightning can kill. Your base, a
shop door and a closed car keep all of it off.

## Seasons

A year is four seasons of **20 game days**, so it lasts 80 days and the seasons turn slowly. The 30 days of preparation
cover about a season and a half. A new game starts early in a season that depends on the game's seed.

| Season | Average | What to expect |
| --- | --- | --- |
| Spring | about 10 C | Mild days, rain on and off, fresh green. |
| Summer | about 24 C | Long hot days, thunderstorms, heatwaves. |
| Autumn | about 10 C | Gold and red leaves, wet and cold nights. |
| Winter | about -4 C | Snow on the ground, bitter cold, cold snaps. |

The picture follows the calendar a little more each day: leaves turn gold and fall, bare branches show in winter, snow
settles on the ground and melts in spring, and the sky tints. A message tells you when a new season begins.

The top bar shows the season, the temperature and the sky, for example *Summer, 23 C, Clear*.

## Weather

Weather comes in spells of several hours that build up and fade away. It is **not saved**: it is worked out from the game's
seed and the clock, so the same game always has the same weather, and a save needs nothing extra.

- **Rain** in spring, summer and autumn. It turns to **snow** when the air is below 1.5 C.
- **Thunderstorms** with lightning and thunder, most often in summer.
- **Heatwaves** (summer) and **cold snaps** (winter and late autumn) last for days and push the temperature up or down by
  8 or 9 degrees. They come on gently over a day or two.
- **Wind and cloud** change the light, the sound and how cold it feels.

Rain and snow are painted over the whole screen, however you turn the view. At night a storm is lit by lightning flashes,
with a jagged bolt in the distance and thunder that follows after the flash.

## What it does to you

All of this applies only when you are **out in the open**. You are sheltered at a shop door, at your base, and in a closed
vehicle (sedan, pickup, van, SUV or truck). A bicycle and a scooter leave you in the weather.

| Weather | Effect |
| --- | --- |
| Rain | Soaks you slowly and costs health (about 0.7 per hour in steady rain, more in a storm). |
| Snow and cold | When the temperature you feel is below 4 C, you lose health. It gets worse the colder it is. |
| Wet | Being wet makes you feel colder. You dry off when you are sheltered. |
| Heat | Above 30 C you get thirsty faster. Above 35 C you also lose health. |
| Lightning | A strike within 4 m does 40 damage, farther out to 12 m less. Wet makes it worse. Nothing happens under cover. |

The health lost is your family's shared health, shown on the left. Warnings appear in the message list before it gets
serious: *soaked*, *freezing*, *overheating*, *a thunderstorm is rolling in*.

**Clothes change all of it.** Dry clothes keep the rain off and warm clothes keep the cold out. See
[Clothing and character](Clothing-and-Character.md).

## Cheats

`NORAIN`, `RAINALLDAY`, `STORM`, `SNOWFALL` take over the sky, `NORMALWEATHER` gives it back, and `SETSEASON winter` moves
the calendar. See [Cheats](Cheats.md).

## In the code

- `src/sim/weather.ts`: `weatherAt(seed, seconds, shift)` and `calendarAt`. Pure functions. `currentWeather(state)` applies a
  cheat or test override.
- `src/sim/exposure.ts`: shelter, wetness, cold, heat, lightning and the warnings. Runs from `stepSim` after survival.
- `src/render/weatherfx.ts`: rain and snow as a full-screen shader. `src/render/seasonfx.ts`: leaf, ground and snow colours
  shared by the trees and the ground. `src/render/atmosphere.ts`: clouds, wind, lightning.
- `state.calendarShift` (saved) is how many days the `SETSEASON` cheat has moved the calendar.
