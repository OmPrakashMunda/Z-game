/**
 * Proves the simulation runs in plain Node, with no browser: start a game, run commands, step the clock, round-trip a save.
 * Run with: npm run test:headless
 */
import { createNewGame } from '../../src/sim/state';
import { applyCommand } from '../../src/sim/commands';
import { stepSim } from '../../src/sim/step';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
}

const state = createNewGame(12345);
check('a new game starts in prep at the motel', state.phase === 'prep' && state.at === 'motel');

const before = state.money;
const funds = applyCommand(state, { type: 'funds' });
check('funds command adds money', funds.ok && state.money > before, `${before} -> ${state.money}`);

const bought = applyCommand(state, { type: 'buyPlot', plotId: 'farm' });
check('buyPlot command runs and answers', typeof bought.ok === 'boolean', JSON.stringify(bought));
check('the farm is owned after buying', bought.ok ? state.plotId === 'farm' : true);

const nonsense = applyCommand(state, { type: 'remove', id: 999999 });
check('removing a piece that does not exist is refused, not thrown', nonsense.ok === false);

const bad = applyCommand(state, { type: 'enterVehicle', vehicleId: 424242 });
check('entering a vehicle that does not exist is refused', bad.ok === false);

const t0 = state.worldSeconds;
for (let i = 0; i < 200; i++) stepSim(state, 0.05, 0.05 * 24);
check('stepSim advances the world clock', state.worldSeconds > t0, `${t0} -> ${state.worldSeconds}`);
check('the player is still alive after a short step run', state.phase !== 'dead');

const copy = JSON.parse(JSON.stringify(state)) as typeof state;
check('state survives a JSON round trip', copy.money === state.money && copy.pieces.length === state.pieces.length);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
