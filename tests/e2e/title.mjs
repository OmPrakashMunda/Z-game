import { chromium } from 'playwright-core';

// The title screens: welcome and username, the main menu, profile, settings, the three save slots and the survivor screen.
const out = (process.env.SHOTS_DIR || process.env.TEMP || '.') + '/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !m.text().includes('GL_INVALID') && !m.text().includes('willReadFrequently')) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const G = (fn, arg) => page.evaluate(fn, arg);
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`);
const slot = (n) => page.locator(`.slot[data-slot="${n}"]`);
const stored = () => G(() => JSON.parse(localStorage.getItem('zgame.profile') ?? 'null'));
const slots = () => G(async () => {
  const s = await import('/src/save/store.ts');
  const list = await s.listSlots();
  return list.map((x) => ({ slot: x.slot, status: x.result.status, name: x.result.state?.character.name, look: x.result.state?.character.look, gender: x.result.state?.character.gender }));
});
const menu = () => page.waitForSelector('.title-screen.main', { timeout: 20000 });

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForSelector('.title-screen', { timeout: 30000 });
await page.waitForTimeout(1200);

// ---- First visit: welcome and username
check('the first visit asks who you are', await page.locator('.title-screen.character').isVisible() && /Welcome/i.test(await page.locator('.title-panel h2').innerText()));
check('there is no way back before a profile exists', (await page.getByRole('button', { name: 'Back' }).count()) === 0);
check('the character turntable is drawn', (await page.locator('.preview-canvas').count()) === 1);
const painted = await G(() => {
  const c = document.querySelector('.preview-canvas');
  const gl = c.getContext('webgl2') ?? c.getContext('webgl');
  return !!gl && c.width > 0;
});
check('the turntable has a 3D context', painted);
await page.screenshot({ path: out + 'title-welcome.png' });

await page.locator('.name-input').fill('ab');
await page.getByRole('button', { name: 'Continue' }).click();
check('a username that is too short is refused', /at least 3/i.test(await page.locator('.form-error').innerText()) && (await page.locator('.title-screen.main').count()) === 0);
await page.locator('.name-input').fill('bad!name');
await page.getByRole('button', { name: 'Continue' }).click();
check('odd characters in a username are refused', /letters, numbers/i.test(await page.locator('.form-error').innerText()));

// Pick a look
await page.getByRole('button', { name: /Woman/ }).click();
check('choosing Woman gives long hair and her usual shirt', await page.locator('.style-btn.active').innerText().then((t) => /long/i.test(t)));
await page.locator('.swatch[aria-label="Skin: Dark"]').click();
await page.locator('.swatch[aria-label="Shirt: Purple"]').click();
await page.locator('.swatch[aria-label="Hair colour: Red"]').click();
check('the chosen swatches are marked', (await page.locator('.swatch.active').count()) === 3);
await page.getByRole('button', { name: 'Bald' }).click();
check('a bald head greys out the hair colours', await page.locator('.swatches.off').count().then((n) => n === 1));
await page.getByRole('button', { name: 'Short' }).click();
await page.locator('.name-input').fill('Rowan_7');
await page.getByRole('button', { name: 'Continue' }).click();
await menu();

// ---- The main menu
check('the main menu shows the username', (await page.locator('.who-name').textContent()) === 'Rowan_7');
check('it says you play as a guest on this device', /guest/i.test(await page.locator('.who-sub').innerText()));
check('the menu has Single player, Multiplayer, Profile and Settings', (await page.locator('.menu-btn').count()) === 4);
check('Multiplayer is marked Soon and cannot be opened', await page.locator('.menu-btn', { hasText: 'Multiplayer' }).isDisabled() && /soon/i.test(await page.locator('.menu-btn', { hasText: 'Multiplayer' }).innerText()));
check('Sign in with Google is there but not available yet', await page.locator('.signin-btn').isDisabled() && /google/i.test(await page.locator('.signin-btn').innerText()));
await page.screenshot({ path: out + 'title-main.png' });
const prof = await stored();
check('the profile was saved with the look', prof?.username === 'Rowan_7' && prof.gender === 'female' && prof.look.skin === 4 && prof.look.shirt === 5 && prof.look.hair === 5 && prof.look.hairStyle === 'short', JSON.stringify(prof));

// ---- A reload goes straight to the menu
await page.reload();
await page.waitForSelector('.title-screen', { timeout: 30000 });
await menu();
check('after a reload the profile is remembered', (await page.locator('.who-name').textContent()) === 'Rowan_7');

// ---- Profile
await page.locator('.menu-btn', { hasText: 'Profile' }).click();
await page.waitForSelector('.title-screen.character');
check('the profile screen is filled in', (await page.locator('.name-input').inputValue()) === 'Rowan_7' && (await page.locator('.swatch.active').count()) === 3);
await page.locator('.name-input').fill('Rowan_8');
await page.getByRole('button', { name: 'Back' }).click();
await menu();
check('Back leaves the profile unchanged', (await page.locator('.who-name').textContent()) === 'Rowan_7');
await page.locator('.profile-chip').click();
await page.waitForSelector('.title-screen.character');
await page.locator('.name-input').fill('Rowan_8');
await page.getByRole('button', { name: 'Save' }).click();
await menu();
check('Save changes the username', (await page.locator('.who-name').textContent()) === 'Rowan_8' && (await stored()).username === 'Rowan_8');

// ---- Settings
await page.locator('.menu-btn', { hasText: 'Settings' }).click();
await page.waitForSelector('.title-screen.settings');
check('settings has sound and a volume slider', (await page.locator('input.volume').count()) === 1 && (await page.getByText(/Sound (on|off)/).count()) === 1);
await page.getByRole('button', { name: 'Back' }).click();
await menu();

// ---- Save slots
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
check('there are three save slots, all empty', (await page.locator('.slot').count()) === 3 && (await page.locator('.slot-empty').count()) === 3);
await page.screenshot({ path: out + 'title-slots.png' });

// A new game in slot 2, with the profile's look and name to start from
await slot(2).getByRole('button', { name: 'New game' }).click();
await page.waitForSelector('.title-screen.character');
check('a new game asks for the survivor, starting from your profile', (await page.locator('.name-input').inputValue()) === 'Rowan_8' && /survivor/i.test(await page.locator('.title-panel h2').innerText()));
check('the survivor screen offers Back', (await page.getByRole('button', { name: 'Back' }).count()) === 1);
await page.getByRole('button', { name: 'Back' }).click();
await page.waitForSelector('.title-screen.slots');
check('Back returns to the slots', (await page.locator('.slot').count()) === 3);
await slot(2).getByRole('button', { name: 'New game' }).click();
await page.waitForSelector('.title-screen.character');
await page.locator('.name-input').fill('Ivy');
await page.getByRole('button', { name: /Man/ }).click();
await page.locator('.swatch[aria-label="Skin: Tan"]').click();
await page.locator('.swatch[aria-label="Shirt: Red"]').click();
await page.screenshot({ path: out + 'title-survivor.png' });
await page.getByRole('button', { name: 'Start game' }).click();
await page.waitForTimeout(2500);
let st = await G(() => JSON.parse(JSON.stringify(window.__game.state.character)));
check('the game starts with the survivor that was made', st.name === 'Ivy' && st.gender === 'male' && st.look.skin === 2 && st.look.shirt === 4, JSON.stringify(st));
check('the game is in the normal corner view', Math.abs((await G(() => window.__game.viewDegrees())) - 45) < 0.5);
check('the HUD is on and the title screen is gone', (await page.locator('.title-screen').count()) === 0 && (await page.locator('.hud').isVisible()));
const rig = await G(() => window.__game.playerLook());
check('the walking character wears that look', rig && rig.shirt === 0xb23a32 && rig.skin === 0xc68b5e, JSON.stringify(rig));
await G(() => { window.__game.survivalOff(true); window.__game.skipToDay(3, 9); window.__game.save(); });
await page.waitForTimeout(800);
let list = await slots();
check('the game is saved in slot 2 only', list[0].status === 'none' && list[1].status === 'ok' && list[2].status === 'none', JSON.stringify(list.map((x) => x.status)));

// ---- Back to the title and the slot card
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.getByText('Save & exit to title').click();
await menu();
check('leaving a game returns to the main menu, not the welcome screen', (await page.locator('.who-name').textContent()) === 'Rowan_8');
check('the profile got the look of the last survivor', (await stored()).look.shirt === 4);
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
const card = slot(2);
check('slot 2 shows the survivor, the day and the money', /ivy/i.test(await card.innerText()) && /day 3 of 30/i.test(await card.innerText()) && /\$/.test(await card.innerText()), (await card.innerText()).replace(/\s+/g, ' '));
check('it offers Continue, New game and Delete', (await card.getByRole('button', { name: 'Continue' }).count()) === 1 && (await card.getByRole('button', { name: 'New game' }).count()) === 1 && (await card.getByRole('button', { name: 'Delete this game' }).count()) === 1);
check('slots 1 and 3 are still empty', (await slot(1).locator('.slot-empty').count()) === 1 && (await slot(3).locator('.slot-empty').count()) === 1);
await page.screenshot({ path: out + 'title-slots-full.png' });

// Replacing asks first
await card.getByRole('button', { name: 'New game' }).click();
check('New game on a used slot asks before replacing it', (await page.getByRole('button', { name: 'Start new game' }).count()) === 1 && (await page.locator('.title-screen.character').count()) === 0);
await page.getByRole('button', { name: 'Cancel' }).click();
await page.waitForSelector('.title-screen.slots');
check('Cancel keeps the game', /ivy/i.test(await slot(2).innerText()));

// A second game goes in slot 1 and slot 2 is untouched
await slot(1).getByRole('button', { name: 'New game' }).click();
await page.waitForSelector('.title-screen.character');
await page.locator('.name-input').fill('Zed');
await page.getByRole('button', { name: 'Start game' }).click();
await page.waitForTimeout(2500);
await G(() => { window.__game.survivalOff(true); window.__game.save(); });
await page.waitForTimeout(800);
list = await slots();
check('slot 1 now has its own game and slot 2 is unchanged', list[0].name === 'Zed' && list[1].name === 'Ivy' && list[2].status === 'none', JSON.stringify(list.map((x) => x.name ?? x.status)));

// Continue loads the right one
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.getByText('Save & exit to title').click();
await menu();
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
await slot(2).getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(2500);
st = await G(() => JSON.parse(JSON.stringify({ c: window.__game.state.character, day: Math.floor(window.__game.state.worldSeconds / 86400) + 1 })));
check('Continue opens the game in that slot', st.c.name === 'Ivy' && st.c.look.shirt === 4 && st.day >= 3, JSON.stringify(st));
// Saving goes back to the same slot
await G(() => { window.__game.state.money += 1000; window.__game.save(); });
await page.waitForTimeout(800);
list = await slots();
check('saving writes to the slot that was opened', list[0].name === 'Zed' && list[1].name === 'Ivy', JSON.stringify(list.map((x) => x.name ?? x.status)));

// ---- Deleting
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.getByText('Save & exit to title').click();
await menu();
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
await slot(1).getByRole('button', { name: 'Delete this game' }).click();
check('Delete asks first', (await slot(1).getByRole('button', { name: 'Delete', exact: true }).count()) === 1 && /for good/i.test(await slot(1).innerText()));
await slot(1).getByRole('button', { name: 'Cancel' }).click();
await page.waitForSelector('.title-screen.slots');
check('Cancel keeps it', /zed/i.test(await slot(1).innerText()));
await slot(1).getByRole('button', { name: 'Delete this game' }).click();
await slot(1).getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForTimeout(600);
check('deleting empties only that slot', (await slot(1).locator('.slot-empty').count()) === 1 && /ivy/i.test(await slot(2).innerText()));
list = await slots();
check('the saved game is really gone', list[0].status === 'none' && list[1].status === 'ok');

// ---- A save from before there were slots still opens, with a default look
await G(async () => {
  const s = await import('/src/save/store.ts');
  const m = await import('/src/sim/state.ts');
  const g = m.createNewGame(1234);
  delete g.character.look;
  g.character.name = 'Oldtimer';
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('zgame', 1);
    req.onsuccess = () => {
      const tx = req.result.transaction('saves', 'readwrite');
      tx.objectStore('saves').put({ version: 9, savedAt: Date.now(), state: g }, 'slot3');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
  return s.SLOT_COUNT;
});
await page.getByRole('button', { name: 'Back' }).click();
await menu();
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
check('an older save shows up in its slot', /oldtimer/i.test(await slot(3).innerText()));
await slot(3).getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(2500);
st = await G(() => JSON.parse(JSON.stringify(window.__game.state.character)));
check('and gets the default look for its gender', st.name === 'Oldtimer' && st.look && st.look.hairStyle === 'short', JSON.stringify(st));

console.log('--- console errors/warnings ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
