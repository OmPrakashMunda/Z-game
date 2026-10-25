# Requirements Document

## Introduction

A single-player, browser-based zombie survival game. The player starts with a large budget and 30 game days before an outbreak. In that time they buy a base plot, order supplies, and build a self-sufficient base. From Day 30 the outbreak begins and the game continues as an endless sandbox of defense, farming, building and supply runs.

This spec covers the first playable version (milestones M0–M7). Cloud saves, the Gemini AI Director, and survivors/other humans are planned for later and are out of scope here, except where an interface is needed so they can be added without rewriting.

**Interaction model:** the preparation phase plays like a city-management game. The player sees the town from above, clicks a place to travel there (which costs game time), and spends their days buying, building and stocking supplies. There is no walking character yet.

**Decisions already made**
- Visual style: flat ground plane with low-poly 3D objects, tilted orthographic camera, level 1 detail (stylized, many props, visible upgrades).
- Real-time, no pause button. The world clock runs at `VITE_TIME_SCALE` times real time (default 24). The clock stops when the tab is closed or hidden.
- The time multiplier affects the world clock only, not future real-time combat or zombie movement.
- Only the Settings and Save & Exit screens stop the clock.

**Assumptions (defaults, adjustable in config)**
- Starting money: $500,000. Three base plots to choose from. Starting items: basic clothes, phone, backpack.
- The outbreak begins suddenly at Day 30, 00:00, with warnings from Day 20.

## Requirements

### Requirement 1: Project setup and configuration

**User Story:** As a player, I want to tune the game speed from a config value, so that I can change it if the pacing doesn't feel right.

#### Acceptance Criteria
1. WHEN the game starts THEN the system SHALL read `VITE_TIME_SCALE` from the environment and use it as the world time multiplier.
2. IF `VITE_TIME_SCALE` is missing, not a number, or not greater than zero THEN the system SHALL use 24 and log a warning.
3. WHEN the game is built THEN the system SHALL keep all secrets (such as API keys) out of variables with the `VITE_` prefix.
4. WHEN game content (items, buildings, locations, balance numbers) is defined THEN the system SHALL load it from data files, not hard-coded logic.

### Requirement 2: World clock and day/night cycle

**User Story:** As a player, I want game time to pass faster than real time and only while I'm playing, so that a 30-day preparation is achievable and nothing happens while I'm away.

#### Acceptance Criteria
1. WHILE the tab is visible and neither the Settings nor the Save & Exit screen is open, the system SHALL advance world time by real elapsed time multiplied by the time scale.
2. WHEN the tab is closed or hidden THEN the system SHALL stop the world clock, and WHEN the player returns THEN the system SHALL NOT apply any catch-up time.
3. IF a single frame's real elapsed time exceeds 250 ms THEN the system SHALL clamp it to 250 ms.
4. WHEN real-time actions such as combat or zombie movement happen (after the outbreak) THEN the system SHALL use real elapsed time, not scaled time. Travel on the map costs game time instead (see Requirement 4).
5. WHEN the game starts a new run THEN the system SHALL begin at Day 1, 08:00.
6. The system SHALL show the current day and time of day on the HUD and SHALL NOT provide a pause control outside the Settings and Save & Exit screens.
7. WHEN world time changes THEN the system SHALL update scene lighting to match dawn, day, dusk and night.

8. The system SHALL let the player fast-forward the clock to 4x or 12x the normal rate and return to normal, from the top bar or with the F key. The chosen speed SHALL NOT be saved, so every load starts at normal speed.
9. WHILE a window is open, build mode is active or the player is travelling, the system SHALL run the clock at normal speed and show that the fast speed is held.
10. WHEN the outbreak starts, a warning appears, or the family's thirst or hunger falls below 35 or health below 70 THEN the system SHALL return to normal speed.
11. The system SHALL let the player turn the view all the way round (360 degrees) with the Q and E keys, by dragging with the right mouse button, or with the turn buttons in the top bar. The player SHALL also be able to tilt the view from a low side angle (30 degrees) to almost straight down (88 degrees) with the Z and C keys, by dragging up and down with the right mouse button, or with the tilt buttons; straight down, squares SHALL appear as squares at every turn angle. A compass SHALL show which way north is and SHALL reset both turn and tilt when clicked. Panning, picking, placing and the names of land edges SHALL follow the turned view, and trees SHALL be cleared around owned land on every side so the base can be seen from any angle.
### Requirement 3: Saving and loading

**User Story:** As a player, I want my progress saved automatically and restored exactly, so that I can leave and resume without losing anything.

#### Acceptance Criteria
1. WHILE the game is running THEN the system SHALL autosave every 60 seconds of active play, and WHEN the tab is hidden or closed THEN the system SHALL save immediately.
2. WHEN a save is written THEN the system SHALL store in-game time and state, never wall-clock timestamps used for gameplay, plus a schema version.
3. WHEN the player resumes THEN the system SHALL restore world time, money, inventory, base layout, construction progress, pending deliveries, zombies and survival needs.
4. IF a save is unreadable or has an unknown version THEN the system SHALL keep the previous good save, tell the player, and offer to start a new game.
5. WHEN the player chooses New Game THEN the system SHALL ask for confirmation before overwriting an existing save.

### Requirement 4: City map and click-to-travel

**User Story:** As a player, I want to look over a small city like a management game and click a place to go there, so that my time goes into buying, building and stocking rather than walking.

#### Acceptance Criteria
1. The system SHALL provide one city map, defined in data, containing a motel (the player's temporary home), a supermarket, hardware store, gas station, pharmacy, farm supply store, gun shop, vehicle dealer, real estate office and four base plots.
2. The system SHALL show the city through a tilted orthographic camera that the player can pan (drag or keyboard) and zoom within limits, and SHALL NOT show a walking player character during the preparation phase.
3. WHEN the player hovers a place THEN the system SHALL highlight it and show its name and travel time.
4. WHEN the player clicks a place THEN the system SHALL show a panel with its details and a travel action.
5. WHEN the player travels THEN the system SHALL advance the game clock by a travel time based on distance, play a short time-lapse, and then open the place (a shop, the realty office, or a details panel).
6. The system SHALL mark the player's current place and the owned base on the map.
7. WHERE a place is closed or unavailable THEN the system SHALL say why and SHALL NOT allow entering it.
8. Walking and supply runs outside the base are planned for after the outbreak and are out of scope until then.

### Requirement 5: Economy and shopping

**User Story:** As a player, I want to spend my money on supplies and have them delivered, so that I can prepare my base.

#### Acceptance Criteria
1. WHEN a new run starts THEN the system SHALL give the player the configured starting money and starting items.
2. WHEN the player opens a store menu before Day 30 THEN the system SHALL list items with price and remaining stock.
3. IF the player lacks the money or the stock THEN the system SHALL block the purchase and explain why.
4. WHEN the player buys items THEN the system SHALL deduct money and stock and put the items into storage instantly, with no delivery fee.
5. WHEN the game reaches Day 20 THEN the system SHALL begin raising prices and reducing stock gradually, and SHALL show news or radio messages hinting at the outbreak.
6. WHEN the outbreak starts THEN the system SHALL close all stores and cancel the ordering menu.
7. IF an order is still in transit when the outbreak starts THEN the system SHALL deliver it normally if its delivery time has already passed, otherwise SHALL refund it in full.
8. WHEN the player wants to order THEN the system SHALL require them to be at that store (by travelling there) and to own a base plot for deliveries.
9. The system SHALL show the player's base storage, pending and recent orders, and a news log in panels they can open at any time.

10. The system SHALL let the player return unused storage items that the online store sells, for 80% of the online price. Returned items SHALL go back on the online shelf, up to its stock cap. Fresh produce and placed structures SHALL NOT be returnable (placed structures use Take down). The refund SHALL NOT depend on panic prices, and returns SHALL be closed after the outbreak.
### Requirement 6: Base plot purchase

**User Story:** As a player, I want to choose and buy where my base goes, so that location is a real strategic decision.

#### Acceptance Criteria
1. The system SHALL offer four plots that differ in size, price, water access, distance from town and how easy they are to defend. One of them is a clearing deep in the woods, reached by a long dirt road.
2. WHEN the player buys a plot at the real estate office THEN the system SHALL deduct the price and assign that plot as the base.
3. IF the player has not bought a plot THEN the system SHALL NOT allow base building or storage deliveries.
4. The system SHALL allow only one plot in the first version.

### Requirement 7: Online store and base building

**User Story:** As a player, I want to buy fences, houses, wells, solar panels and everything else from one online store, keep them in storage, and place them on my land, so that I can design a base without travelling.

#### Acceptance Criteria
1. The system SHALL provide an online store, available from anywhere without travel, that sells every supply the town shops sell plus a full range of structures.
2. The online store SHALL list structures in these groups: fences, walls and gates; houses and shelters; wells and water; power; farming; defense; storage; and utility. It SHALL offer several types of fences (picket, chain-link, barbed wire, electric, log palisade, sandbags), walls (cinder block, concrete, steel), shipping containers and gates.
3. WHEN the player buys from the online store or a town shop THEN the system SHALL deliver the order to storage instantly, with no delivery fee. The online store SHALL charge slightly more than town shops for the convenience.
4. The system SHALL let the player search the store and filter it by category, SHALL open the online store on a building category, and SHALL show each structure's size and build time.
4a. The system SHALL show a small picture of each structure (a render of its real 3D model) in the store, in storage and on the build bar, and an icon tile for supplies.
5. WHEN a structure is delivered THEN the system SHALL keep it in storage until the player places it.
6. WHEN the player chooses to place a stored structure THEN the system SHALL take them to their base if they are not there, show a grid over the plot, and show a green or red preview that follows the pointer.
7. IF a placement is outside the plot, overlaps another structure, or the player has none in storage THEN the system SHALL mark it invalid, explain why, and not place it.
8. WHEN a valid placement is made THEN the system SHALL remove one from storage and add the structure as a plan that the work crew builds over game time (a crew of three works on the oldest unfinished pieces at once).
9. WHEN the player drags with a single-cell structure THEN the system SHALL lay a line of them and turn fences and walls to follow the drag.
10. The system SHALL let the player rotate a structure, switch between stored structures with the keyboard, and take a structure down, which SHALL return it to storage.
11. WHEN a structure is under construction THEN the system SHALL show it growing as work progresses.
12. The system SHALL provide a build bar with the stored structures and rotate, take-down, buy-more-land, buy-more and exit controls, and a Build button on the main screen.
13. Barrier structures SHALL have hit points that zombies can reduce and the player can repair using materials (planned for the outbreak milestone).
14. The system SHALL offer landscaping: three kinds of pond (including a stocked fish pond), four kinds of tree, hedges, flower beds, three kinds of path, a fire pit, benches, a picnic table, a flag pole and boulders.
15. WHEN the player buys more land THEN the system SHALL let them extend their plot by a 10 m strip on any side that is not blocked by a road, a building or another plot, up to four times per side, at a price based on what they paid for the plot, clear the trees on the new land, and let them build there. Existing structures SHALL NOT move.

16. Fences, walls, sandbag walls and gates SHALL sit on the lines between tiles, not in tile centres. Posts SHALL be shared at corners, and edge pieces SHALL NOT run through the middle of a larger building. Hedges SHALL stay on tiles and join their neighbours.
17. WHEN the player clicks a product in a store THEN the system SHALL show a sheet saying what it is, what it does, how it works and its main numbers, taken from the same data the simulation uses. Items the game does not use yet SHALL say so.
18. Models SHALL be scaled to fit the tiles they occupy.
19. The system SHALL provide a base architect (Plan base button, P key) that reports what the base has and lacks (beds, food, water, power, outer wall, watch posts, seeds), and designs an upgrade around the pieces already standing. The design SHALL put crops in an outer belt inside a boundary wall with a gate facing the nearest road, put two more log cabins, water and power in an inner yard behind a second fence, add watchtowers, floodlights, gun nests and spike traps, and size food, water and power for eight people.
20. The architect SHALL test its design on a copy of the game for several days, report the result and any problems, buy the plan from the online store at current prices, and lay it out as plans for the crew to build. It SHALL show the cost and any shortfall, and SHALL offer a sandbox top-up of $500,000.
21. WHEN the plot is too small for the architect's full design THEN the architect SHALL first plan the cheapest strips of land on open sides (never past roads, buildings or neighbours) until the land is about 44 x 36 m, include their price in the plan, buy them before ordering, and add a week of food and water for the people it is sized for.
22. The system SHALL accept typed cheat codes in a box opened with the backquote key: buildnow (finish all building at once), money (add $500,000) and woodsbase (a finished, tested base in the Deep Woods Clearing, with land bought to fit).
23. The system SHALL NOT have a separate building mode. Placing SHALL start from the storage list (or by lifting a placed structure to move it), show a small placing bar with the structure, rotate, storage and done controls, and end on Esc, Done or when the last one is used.
24. EVERY placed structure SHALL open its own card when clicked, showing its strength, dirt, upgrade level, output and problems, with Rotate, Move, Take down, Repair, Upgrade and Clean. Rotating and moving SHALL be instant and free, and keep the structure's strength, level and contents. A click on the ground right beside a thin structure such as a fence SHALL count as clicking it.
25. Structures SHALL wear slowly over game time at a rate that depends on what they are made of (a wooden fence about 24% a month, a concrete wall about 4%). Ponds, solar panels, rain collectors and greenhouse glass SHALL also get dirty. Worn or dirty machines SHALL produce less, and a structure that is badly worn or dirty SHALL show a warning sign and appear in the advisor.
26. Repair SHALL need a toolbox (kept) and materials (used up) in storage. Upgrading (three levels, each adding strength, output and slower wear) SHALL need a power tool set or welding kit (kept) and materials. Cleaning SHALL need a shovel (ponds) or soap (panels and glass). The tools and materials SHALL be sold in the shops now, and are meant to be found on supply runs later.
27. Taking down a worn structure SHALL give back scrap materials instead of the structure, so it cannot be used as a free repair.
28. Power cables and water pipes SHALL be drawn as a tidy spanning tree (cables hung between structures with a little sag, pipes laid on the ground with square corners), and SHALL be shown only in the utility view (U or the cable button), while placing, and for the selected structure.
### Requirement 8: Survival needs, utilities and the advisor

**User Story:** As a player, I want my family to need food and water, and my base to need working water, power and farms, with the game telling me what is missing, so that anyone can learn to play and being self-sufficient matters.

#### Acceptance Criteria
1. WHEN the player buys a base plot THEN the system SHALL hand over move-in food and water for about six days and tell the player to build water and food sources first.
2. WHILE the family has a base THEN the system SHALL use 3 L of water and 3 meals per person per day (four people), taking water from sources and tanks before bottled water, and food from fresh produce before canned and dry goods.
3. IF there is no water THEN thirst SHALL fall to zero in 36 game hours, and IF there is no food THEN hunger SHALL fall to zero in 72 game hours. IF either is zero THEN health SHALL fall, and WHEN health reaches zero THEN the game SHALL end with a message that says why, without overwriting the last good save.
4. The system SHALL show health, thirst and hunger bars and the days of water, food and power left, in red when under 2.5 days.
5. WHEN supplies run low, or the base has no way to make water or food, THEN the system SHALL send a notification, at most once per 14 game hours for the same problem.
6. Power and water SHALL form networks: two structures join when the gap between them is within the larger of their reaches and at least one is a conductor. Power poles and pipe junctions reach 14 m, other sources, batteries and tanks 5 to 8 m, and plain machines 3 m.
7. A powered structure SHALL need a network with a source. Solar panels SHALL make power by day only, wind turbines when the wind blows, and generators SHALL burn gasoline or diesel only when power is short. Batteries SHALL store power and give it back at night.
8. A well SHALL make clean water. Ponds and rain collectors SHALL make raw water that is only drinkable through a powered water filter in the same network. Tanks SHALL store water and fill evenly. Farms SHALL need a water link, and seeds or animal feed at the start of each growing cycle, and SHALL then grow over game days and be harvested into fresh produce.
9. WHEN a structure is missing something it needs THEN the system SHALL show a warning sign above it with a symbol for power, water, fuel, seeds or feed, and explain what to do in its tooltip.
10. The system SHALL show dashed lines between joined structures: yellow for power and blue for water.
11. The advisor SHALL list the survival steps in order (water, tank, food, reserve, power, shelter, walls), mark the first unfinished step as next, explain why, and offer a button that buys or places what it asks for. It SHALL raise urgent alerts when thirst or hunger is low or supplies are short, and list broken structures with a button that shows each one.
12. Fatigue and sleeping are not part of the first version.

### Requirement 9: Outbreak and zombies

**User Story:** As a player, I want zombies to threaten my base in a way that responds to my defenses, so that preparation matters.

#### Acceptance Criteria
1. WHEN world time reaches Day 30, 00:00 THEN the system SHALL start the outbreak and begin spawning zombies.
2. The system SHALL provide at least two zombie types: walker and runner.
3. WHEN noise (generators, gunfire, building) or light is present THEN the system SHALL attract nearby zombies toward it.
4. WHEN zombies target the base THEN the system SHALL move them along the cheapest route, where intact barriers cost more to pass, and make them attack barriers that block them.
5. WHEN days pass after the outbreak THEN the system SHALL increase wave size and frequency, and SHALL spawn more zombies at night.
6. The system SHALL limit simultaneously active zombies to a configured cap (default 150).
7. IF the player's health reaches zero THEN the system SHALL end the run and offer to load the last save or start a new game.
8. The system SHALL continue indefinitely after the outbreak starts, with no fixed end.

### Requirement 10: Supply runs

**User Story:** As a player, I want to leave my base to loot the city and bring back supplies, so that I'm never fully safe inside.

#### Acceptance Criteria
1. WHEN the outbreak has started THEN the system SHALL allow the player to loot containers inside city locations, taking a duration in game time per search.
2. The system SHALL limit what the player can carry using backpack capacity.
3. WHEN the player uses a vehicle THEN the system SHALL increase carry capacity and travel speed, consume fuel, and make noise.
4. WHEN a location is looted THEN the system SHALL deplete its loot and SHALL restore it slowly over many game days.
5. WHEN the player carries loot back to base storage THEN the system SHALL add it to the base inventory.

### Requirement 11: Visual style and assets

**User Story:** As a player, I want a consistent, detailed low-poly look, so that the base feels alive.

#### Acceptance Criteria
1. The system SHALL render a flat ground plane with low-poly 3D models and props, lit with shadows.
2. The system SHALL include props such as barrels, crates, sandbags, tires, a car, trees, a generator, a water tank and lamp posts.
3. WHEN barriers are damaged or buildings upgraded THEN the system SHALL show those states visually.
4. WHEN third-party assets are used THEN the system SHALL only use assets with a license that permits it and SHALL list them in a CREDITS file.
5. The system SHALL use dense forest around the town and thick woods around the dirt road and the woods plot.
6. The user interface SHALL use SVG icons (Lucide, ISC license) and SHALL NOT use emoji.

### Requirement 12: Events director

**User Story:** As a developer, I want game events produced behind a replaceable interface, so that the Gemini AI Director can be added later without rewriting the game.

#### Acceptance Criteria
1. The system SHALL generate world events (news messages, panic-buying steps, wave schedules) through a Director interface that takes a world summary and returns a list of events.
2. The first version SHALL provide a rule-based Director implementation.
3. WHEN a Director returns events THEN the system SHALL validate them against a schema and limit their effects.

### Requirement 14: A living world

**User Story:** As a player, I want the world to feel alive with sound, traffic, day and night and weather, so that the town and the forest feel like real places.

#### Acceptance Criteria
1. The system SHALL generate all sound in code (no downloaded files) and start it after the player's first click or key press.
2. The system SHALL play ambience that depends on where the camera is and on the time of day: wind always; rustling leaves that grow louder in the woods; birdsong by day; crickets and owls at night; traffic hum in town that fades away in the woods; water near ponds and streams; crackling near fire pits; rain and occasional thunder.
3. WHEN the outbreak starts THEN the system SHALL stop the traffic and birdsong and replace them with a low, uneasy drone.
4. The system SHALL play short sounds for clicks, purchases, placing and taking down structures, errors, and finished buildings.
5. The system SHALL let the player mute with the M key or a HUD button, set the volume in the menu, and SHALL remember these settings.
6. The system SHALL drive cars along the town's roads in lanes, keep a safe distance between them, stop them at red lights, and show headlights at night. The roads SHALL be busier at rush hour than late at night, and traffic SHALL stop after the outbreak starts.
7. The system SHALL show the day part (dawn, day, dusk, night) as a sun or moon icon next to the clock.
8. The system SHALL show drifting cloud shadows by day, flocks of birds crossing by day, fireflies among the trees at night, and occasional rain showers that dim the light and are marked in the HUD.
9. The scenery SHALL be decoration only: it SHALL NOT be saved and SHALL NOT affect the game rules.

### Requirement 13: Performance and robustness

**User Story:** As a player, I want the game to run smoothly and fail gracefully.

#### Acceptance Criteria
1. The system SHALL target 60 frames per second on a mid-range laptop with a full base and the zombie cap reached.
2. The system SHALL use instanced rendering for repeated pieces and limit shadow-casting lights.
3. IF a model or texture fails to load THEN the system SHALL show a placeholder and a readable error without crashing.
4. The system SHALL keep game logic independent of rendering so it can run without a graphics context.
