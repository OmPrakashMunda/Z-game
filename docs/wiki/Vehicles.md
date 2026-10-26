# Vehicles

Seven vehicles are for sale at **Rusty Wheels Autos** and in the online store. A vehicle you buy at the dealership is
parked outside it. One you order online is parked beside your land. Either way a waypoint marks it.

| Vehicle | Price | Fuel | Tank | Range | Top speed | Durability | Cargo | Seats | Noise | Off-road | Tows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bicycle | $350 | none | - | unlimited | 25 km/h | 60 | 12 kg | 1 | silent | 85% | no |
| Scooter | $2,600 | petrol | 7 L | 23 km | 54 km/h | 90 | 25 kg | 2 | loud | 60% | no |
| Sedan | $11,500 | petrol | 50 L | 33 km | 101 km/h | 220 | 90 kg | 5 | quiet | 35% | no |
| Pickup truck | $18,500 | petrol | 80 L | 36 km | 94 km/h | 320 | 450 kg | 3 | loud | 70% | 1,500 kg |
| Cargo van | $22,000 | diesel | 70 L | 35 km | 86 km/h | 260 | 700 kg | 3 | loud | 45% | 1,000 kg |
| SUV | $16,000 | petrol | 75 L | 29 km | 104 km/h | 380 | 220 kg | 5 | loud | 85% | 1,500 kg |
| Box truck | $54,000 | diesel | 200 L | 44 km | 68 km/h | 600 | 2,000 kg | 3 | very loud | 60% | 5,000 kg |

The numbers come from `src/data/vehicles.ts`, which is also where the product sheet reads them. Noise does nothing yet:
it is for the zombies. Click a vehicle in a store to see its sheet.

## Driving

Walk up to a parked vehicle and press `Space` (the prompt says "Drive ..."). While driving:

| Key | Action |
| --- | --- |
| `W` / `S` | Gas / brake, then reverse |
| `A` / `D` | Steer, as the driver sees it |
| `Shift` | Handbrake |
| `Space` | Get out (you must be slower than about 14 km/h) |

The display at the bottom shows speed, fuel, condition and load. The camera follows the vehicle and the world streams in
ahead of it.

- **Surface.** Roads give full speed. Open ground limits you to the vehicle's off-road share (a sedan keeps 35%, an SUV 85%).
  The dirt road to the woods is in between.
- **Fuel** is used by distance. Out of fuel, the engine stops and you coast. A trailer adds a quarter to the use.
- **Crashes.** Hitting a house, a tree or a prop at speed does damage in proportion to the speed squared. Scraping along a
  wall does a little. Under 30% condition the top speed drops. At zero, it will not run.
- **Parked cars.** Vehicles stay where you leave them and are saved with the game.

## Looking after a vehicle

Click a vehicle (or stand beside it) to open its card:

- **Fill from fuel cans.** Uses gasoline or diesel cans carried in the vehicle, or in storage when you are at your base.
- **Fill up at the pump.** Park beside the pumps at Quick Fuel (before the outbreak). You pay the gas station's price per litre.
- **Repair.** Uses spare parts (30 hit points per box), carried or in storage at the base. Spare parts are sold at the
  hardware store, the dealership and online.
- **Cargo: load and unload.** See [Looting and carrying](Looting-and-Carrying.md).

## Parts

Parts are store items. Buy one, then fit it from the card while you are at your base.

| Part | Price | Fits | Effect |
| --- | --- | --- | --- |
| Tow hitch | $420 | pickup, van, SUV, box truck | Lets it pull a trailer |
| Utility trailer | $4,200 | needs a tow hitch | +600 kg of load, -8% top speed, 20% slower to accelerate, wider turns |
| Roof rack | $380 | sedan, pickup, van, SUV | +80 kg |
| Bull bar | $750 | cars and trucks | Crash damage is halved |
| Extra fuel tank | $540 | cars and trucks | +30 L |

The trailer's axle follows the hitch, so it swings wide on a turn. A hitch cannot come off while a trailer is on it. Taking
a part off puts it back in storage.

## Cheats

`ENDLESSFUEL` (no fuel is used) and `TOUGHCARS` (crashes do no damage). See [Cheats](Cheats.md).
