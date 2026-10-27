/**
 * Several players in one world, in plain Node: each keeps their own place, pack, clothes, vehicle and search, while money,
 * storage and the clock are shared. Run with: npm run test:headless
 */
import { VEHICLES, type VehicleId } from '../../src/data/vehicles';
import { activeSearch } from '../../src/sim/loot';
import { defaultCharacter, createNewGame } from '../../src/sim/state';
import { addVehicle } from '../../src/sim/vehicles';
import {
  addPlayer, createWorld, drivePlayer, MAX_PLAYERS, removePlayer, runCommand, stepWorld, walkPlayer, withPlayer,
} from '../../src/sim/players';
import { housesInChunk } from '../../src/world/gen';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
}

const state = createNewGame(777);
const world = createWorld(state, 'ann');
const bob = addPlayer(world, 'bob', { ...defaultCharacter(), name: 'Bob' });
check('a second player can join', 'id' in bob && world.players.size === 2);
check('the same player cannot join twice', 'ok' in addPlayer(world, 'bob', defaultCharacter()));

// Walking
const startAnn = { ...world.players.get('ann')!.pos };
const startBob = { ...world.players.get('bob')!.pos };
walkPlayer(world, 'ann', { x: 1, z: 0 }, false, 1);
const annNow = world.players.get('ann')!.pos;
const bobNow = world.players.get('bob')!.pos;
check('walking moves only the one who walks', annNow.x > startAnn.x + 1 && bobNow.x === startBob.x && bobNow.z === startBob.z, `${annNow.x} ${bobNow.x}`);

// Packs and clothes
withPlayer(world, 'bob', (s) => { s.pack.water = 3; });
check('a pack belongs to one player', Object.keys(world.players.get('ann')!.pack).length === 0 && world.players.get('bob')!.pack.water === 3);
const off = runCommand(world, 'bob', { type: 'takeOff', slot: 'body' });
check('taking clothes off works for the one who does it', off.ok === true && world.players.get('bob')!.outfit.body === null);
check('the other player keeps their clothes', world.players.get('ann')!.outfit.body === 'tshirt');
check('the shirt went into bob\'s pack, not ann\'s', world.players.get('bob')!.pack.tshirt === 1 && !world.players.get('ann')!.pack.tshirt);

// Shared money, and no cheats
const money = state.money;
const refused = runCommand(world, 'ann', { type: 'funds' });
check('cheats are refused in a shared world', refused.ok === false && state.money === money);
world.cheats = true;
runCommand(world, 'bob', { type: 'funds' });
check('with cheats on, money is shared by everyone', state.money > money);
world.cheats = false;

// The clock runs once however many are in
const before = state.worldSeconds;
stepWorld(world, 0.05, 10);
check('the clock advances once for the whole world', Math.abs(state.worldSeconds - before - 10) < 1e-6, `${state.worldSeconds - before}`);

// The world holds four
addPlayer(world, 'cat', defaultCharacter());
addPlayer(world, 'dan', defaultCharacter());
const fifth = addPlayer(world, 'eve', defaultCharacter());
check(`the world holds only ${MAX_PLAYERS}`, 'ok' in fifth && world.players.size === MAX_PLAYERS);
removePlayer(world, 'dan');
check('a place frees up when someone leaves', 'id' in addPlayer(world, 'eve', defaultCharacter()));

// Driving: one driver per vehicle
const type = Object.keys(VEHICLES)[0] as VehicleId;
const car = addVehicle(state, type, { x: annNow.x, z: annNow.z, heading: 0 });
withPlayer(world, 'bob', (s) => { s.pos.x = car.x; s.pos.z = car.z; });
const annIn = runCommand(world, 'ann', { type: 'enterVehicle', vehicleId: car.id });
check('the first player gets in', annIn.ok === true && world.players.get('ann')!.driving === car.id);
const bobIn = runCommand(world, 'bob', { type: 'enterVehicle', vehicleId: car.id });
check('the second player is refused the same vehicle', bobIn.ok === false && world.players.get('bob')!.driving === null);
const drove = drivePlayer(world, 'ann', { throttle: 1, steer: 0, brake: false }, 0.5);
check('the driver can drive', drove !== null && car.speed > 0);
check('a passenger on foot cannot drive it', drivePlayer(world, 'bob', { throttle: 1, steer: 0, brake: false }, 0.5) === null);
car.speed = 0;
runCommand(world, 'ann', { type: 'exitVehicle' });
const bobIn2 = runCommand(world, 'bob', { type: 'enterVehicle', vehicleId: car.id });
check('after the driver gets out, another can get in', bobIn2.ok === true && world.players.get('bob')!.driving === car.id);
runCommand(world, 'bob', { type: 'exitVehicle' });

// Searches belong to a player
state.phase = 'outbreak';
let houseId = '';
for (let cx = -4; cx < 4 && !houseId; cx++) for (let cz = -4; cz < 4 && !houseId; cz++) houseId = housesInChunk(cx, cz)[0]?.id ?? '';
check('a house to search was found', houseId !== '');
const search = runCommand(world, 'ann', { type: 'search', houseId });
check('a search starts', search.ok === true);
check('the searcher is searching', withPlayer(world, 'ann', (s) => activeSearch(s) !== null));
check('the others are not', withPlayer(world, 'bob', (s) => activeSearch(s) === null));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
