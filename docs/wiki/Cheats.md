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
which are rebuilt from nothing every time a game is loaded and are not part of the save. The picture-only switches (rain
and cars) are in `session` in `src/cheats.ts`, and are reset whenever a game is left or loaded.

## Switches

Type the code to turn it on. Type it again to turn it off.

| Code | Effect |
| --- | --- |
| `NONIGHT` | It is always 12:00. The light, solar panels, lamps and floodlights follow. Replaces `NODAY`. |
| `NODAY` | It is always midnight. Replaces `NONIGHT`. |
| `NORAIN` | It never rains. |
| `RAINALLDAY` | It rains all the time. Replaces `NORAIN`. |
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
| `NORMALWEATHER` | Turns off `NORAIN` and `RAINALLDAY`. |
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
