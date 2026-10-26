# Cheats

Press the backquote key (`` ` ``, left of `1`) to open the cheat box. Type a code and press Enter. `Esc` or the backquote
key closes it. Codes are not case sensitive. Type `HELP` for the list and to see which switches are on.

## Cheats last for the session only

Cheats are **never saved**. They are switched off when you:

- leave to the title screen ("Save & exit to title"),
- load a save or start a new game, or
- reload or close the page.

While any cheat is on, a red **Cheats** tag shows in the top bar. Hover it to see which.

Where this comes from in the code: the rule switches live in the simulation's runtime notes (`runtimeOf(state).cheats`),
which are rebuilt from nothing every time a game is loaded and are not part of the save. The picture-only switches (cars)
are in `session` in `src/cheats.ts`, and are reset whenever a game is left or loaded. The weather switches set
`runtimeOf(state).weatherOverride`, which the rules and the picture both read. The movement codes are in
`src/cheats-move.ts`.

## Switches

Type the code to turn it on. Type it again to turn it off.

| Code | Effect |
| --- | --- |
| `NONIGHT` | It is always 12:00. The light, solar panels, lamps and floodlights follow. Replaces `NODAY`. |
| `NODAY` | It is always midnight. Replaces `NONIGHT`. |
| `NORAIN` | The sky stays dry: no rain, no snow, no storm. |
| `RAINALLDAY` | It rains all the time. Replaces the other weather switches. |
| `STORM` | A thunderstorm rages all the time, with lightning. It can hurt you in the open. |
| `SNOWFALL` | It snows all the time. |
| `NOBUILDTIME` | Everything you place is finished the moment it is placed, and everything unfinished is finished at once. |
| `NOCARS` | Hides all the traffic on the roads, including new cars. The traffic lights stay. |
| `NOWEAR` | Nothing wears out or gets dirty. |
| `FREEREPAIRS` | Repairs, upgrades and cleaning cost nothing and need no tools (you still have to be at your base). |
| `GODMODE` | Your family never gets hungry or thirsty and never loses health. |
| `FREESHOP` | Everything in every shop costs nothing. |
| `FREEZETIME` | The world clock stops. You can still walk and drive. |
| `ENDLESSFUEL` | Vehicles use no fuel. |
| `TOUGHCARS` | Crashes do no damage to your vehicles. |
| `QUICKSEARCH` | Searching a house takes no time. |
| `FASTFEET` | You walk and run three times as fast. |
| `NOCLIP` | Walls, houses, trees and fences no longer stop you or your vehicles. The edge of the world still does. |
| `BIGPACK` | Your backpack and your vehicles carry any weight. |
| `TURBO` | Vehicles are twice as fast and pick up speed twice as quickly. |

## Getting around

| Code | Effect |
| --- | --- |
| `BACKTOBASE` | Takes you, and the vehicle you are driving, to the middle of your land. |
| `GOTO place` | Takes you to a place: `base`, `motel`, `realty`, `hardware`, `supermarket`, `pharmacy`, `guns`, `farmsupply`, `gas`, `dealer`, `woods`, `farmstead`, `warehouse` or `creekside`. A wrong name lists them. |
| `GOTOHOUSE` | Takes you to the door of the nearest house nobody has searched. |
| `GOTOCAR` | Takes you to your nearest vehicle. |
| `CALLCAR` | Brings your nearest vehicle to you. |
| `GOTOWAYPOINT` | Takes you to the waypoint you set on the map. |
| `COORDS x z` | Takes you to a map position. Example: `COORDS 150 -40`. The world runs from -640 to 640. |
| `WHEREAMI` | Tells you your map position and where you are. |
| `GIVECAR type` | Parks a vehicle with a full tank in front of you: `bicycle`, `scooter`, `sedan`, `pickup`, `van`, `suv` or `truck` (a pickup if you leave it out). |
| `REFUELALL` | Fills the tank of every vehicle you own. |
| `REPAIRCARS` | Repairs every vehicle you own. |
| `EMPTYPACK` | Moves everything in your backpack into storage, wherever you are. |
| `RESETHOUSES` | Makes every searched house full again. |

Teleporting while you drive takes the vehicle with you.

## One-off codes

| Code | Effect |
| --- | --- |
| `BUILDNOW` | Finishes everything that is being built. |
| `MONEY` | Adds $500,000. |
| `SETMONEY n` | Sets your money to n dollars. Example: `SETMONEY 250000`. |
| `SKIPDAY` | Jumps to 08:00 the next day. Everything that happens on the way (growth, restocks, deliveries, the outbreak) happens. |
| `SETDAY n` | Jumps forward to 08:00 on day n. Time only goes forward. |
| `FIXALL` | Repairs and cleans every structure. |
| `MAXUPGRADE` | Upgrades every structure that can be upgraded to level 3. |
| `GIVETOOLS` | Gives the toolbox, shovel, power tools and welding kit, 20 of each repair material and 10 soap. |
| `STOCKUP` | Gives 30 cases of canned food and bottled water, rice, fuel, seeds and animal feed. |
| `FULLTANKS` | Fills every water tank and battery. |
| `WOODSBASE` | Buys the Deep Woods Clearing if you have no plot, buys land to grow it to about 46 x 44 m, builds the Architect's whole design and finishes it. Adds funds if needed. It will not run if you already own a different plot. It also moves you to the base. |
| `NORMALTIME` | Turns off `NONIGHT`, `NODAY` and `FREEZETIME`. |
| `NORMALWEATHER` | Turns off `NORAIN`, `RAINALLDAY`, `STORM` and `SNOWFALL`, so the real weather returns. |
| `SETSEASON name` | Moves the calendar to early `spring`, `summer`, `autumn` or `winter`. |
| `GIVECLOTHES` | Puts one of every piece of clothing into your storage. |
| `RESETCHEATS` | Turns every switch off. |
| `HELP` | Lists the codes and which switches are on. |

## Things to know

- `SKIPDAY` and `SETDAY` can jump over Day 30. The outbreak then starts, the shops close, and that cannot be undone.
- A cheat changes the game you are in. Anything it gave you or built (money, items, a base) is a normal part of the save and
  stays after the cheat switches turn off.
- `FREESHOP` changes the price you pay, not the stock. Shelves can still run out.

## Adding a cheat

Add a case to `runCheatCode` in `src/cheats.ts` and a row to `CHEAT_LIST` in the same file. A rule switch needs a field in
`CheatFlags` (`src/sim/utilities.ts`) and one place in the simulation that reads it. Add the code to this page.
