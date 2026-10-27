import { chromium } from 'playwright-core';

// Sign-in, the profile with a unique username, and cloud saves. Firebase is replaced by an in-memory stand-in that follows the
// same rules (see src/account/account.ts, Backend), so this tests the game's behaviour, not Google. firestore.rules is checked
// separately against the real project (see Testing.md).
const out = (process.env.SHOTS_DIR || process.env.TEMP || '.') + '/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (['error'].includes(m.type()) && !m.text().includes('GL_INVALID')) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const G = (fn, arg) => page.evaluate(fn, arg);
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`);
const slot = (n) => page.locator(`.slot[data-slot="${n}"]`);
const menu = () => page.waitForSelector('.title-screen.main', { timeout: 20000 });
const fake = (fn, arg) => G(([src, arg]) => new Function('f', 'arg', `return (${src})(f, arg)`)(window.__fake, arg), [fn.toString(), arg]);
const exitToTitle = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.getByText('Save & exit to title').click();
  await menu();
};
const buttonSays = (re) => page.waitForFunction((src) => new RegExp(src, 'i').test(document.querySelector('.signin-btn')?.textContent ?? ''), re, { timeout: 10000 });
const rerenderMenu = async () => {
  await page.locator('.menu-btn', { hasText: 'Settings' }).click();
  await page.waitForSelector('.title-screen.settings');
  await page.getByRole('button', { name: 'Back' }).click();
  await menu();
};

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForSelector('.title-screen', { timeout: 30000 });

// ---- As a guest: a profile and a game
await page.locator('.name-input').fill('Guesty');
await page.getByRole('button', { name: 'Continue' }).click();
await menu();
check('without Firebase settings the sign-in button is off', await page.locator('.signin-btn').isDisabled());
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
check('a guest sees no cloud notes on the slots', (await page.locator('.slot-where').count()) === 0);
await slot(1).getByRole('button', { name: 'New game' }).click();
await page.waitForSelector('.title-screen.character');
await page.locator('.name-input').fill('Gus');
await page.getByRole('button', { name: 'Start game' }).click();
await page.waitForTimeout(2500);
await G(() => { window.__game.survivalOff(true); return window.__game.save(); });
await exitToTitle();

// ---- Put the stand-in for Firebase in place
await G(async () => {
  const a = await import('/src/account/account.ts');
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const fake = {
    users: { u1: { uid: 'u1', name: 'Gina Google' }, u2: { uid: 'u2', name: 'Hank Google' } },
    next: 'u1', signedIn: null, profiles: {}, names: {}, saves: {}, failPuts: false,
    async restore() { return this.signedIn ? this.users[this.signedIn] : null; },
    async signIn() { this.signedIn = this.next; return this.users[this.next]; },
    async signOut() { this.signedIn = null; },
    async loadProfile(uid) { return this.profiles[uid] ? clone(this.profiles[uid]) : null; },
    async saveProfile(uid, p, prev) {
      const key = a.usernameKey(p.username);
      if (this.names[key] && this.names[key] !== uid) throw new a.UsernameTakenError();
      if (prev && this.names[a.usernameKey(prev)] === uid && a.usernameKey(prev) !== key) delete this.names[a.usernameKey(prev)];
      this.names[key] = uid;
      this.profiles[uid] = clone(p);
    },
    cloudSlots(uid) {
      const self = this;
      return {
        async list() { const m = new Map(); for (const [s, e] of Object.entries(self.saves[uid] ?? {})) m.set(Number(s), clone(e)); return m; },
        async put(s, env) { if (self.failPuts) throw new Error('offline'); (self.saves[uid] ??= {})[s] = clone(env); },
        async remove(s) { delete (self.saves[uid] ?? {})[s]; },
      };
    },
  };
  window.__fake = fake;
  a.useBackend(fake);
});
await rerenderMenu();
check('with a sign-in service the button is on', !(await page.locator('.signin-btn').isDisabled()) && /sign in with google/i.test(await page.locator('.signin-btn').innerText()));

// ---- First sign-in: the profile is claimed and the guest games are offered
await page.locator('.signin-btn').click();
await page.waitForSelector('.title-screen.guest-games', { timeout: 10000 });
check('signing in offers the games played as a guest', /gus/i.test(await page.locator('.guest-list').innerText()), (await page.locator('.guest-list').innerText()).replace(/\s+/g, ' '));
check('the account took the profile, with its username reserved', (await fake((f) => ({ p: f.profiles.u1?.username, n: f.names.guesty }))).p === 'Guesty' && (await fake((f) => f.names.guesty)) === 'u1');
await page.screenshot({ path: out + 'cloud-guest-offer.png' });
await page.getByRole('button', { name: 'Copy to my account' }).click();
await menu();
check('the main menu says the saves go to the cloud and offers Sign out', /cloud/i.test(await page.locator('.who-sub').innerText()) && (await page.locator('.signin-btn').innerText()).toLowerCase().includes('sign out'));
check('the guest game is in the cloud', (await fake((f) => f.saves.u1?.[1]?.state.character.name)) === 'Gus');

// ---- The slots say where each game is
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
check('slot 1 shows the game and says it is in the cloud', /gus/i.test(await slot(1).innerText()) && /saved to the cloud/i.test(await slot(1).innerText()));
await page.screenshot({ path: out + 'cloud-slots.png' });

// ---- Playing saves to the cloud
await slot(1).getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(2500);
const before = await fake((f) => f.saves.u1[1].savedAt);
await G(() => { window.__game.survivalOff(true); window.__game.state.money += 4321; return window.__game.save(); });
const afterSave = await fake((f) => ({ at: f.saves.u1[1].savedAt, money: f.saves.u1[1].state.money }));
check('saving writes the new state to the cloud', afterSave.at > before && afterSave.money > 500000, JSON.stringify(afterSave));

// ---- Offline: the game is still saved on the device, and says so
await fake((f) => { f.failPuts = true; });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Save game' }).click();
await page.waitForTimeout(800);
check('a failed cloud save is reported', /cloud copy could not be updated/i.test(await page.locator('.toast').innerText()));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await G(() => { window.__game.state.money += 1000; return window.__game.save(); });
await exitToTitle();
await fake((f) => { f.failPuts = false; });
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
await page.waitForTimeout(500);
check('a newer game on the device is sent to the cloud when it is back', (await fake((f) => f.saves.u1[1].state.money)) >= 505321, String(await fake((f) => f.saves.u1[1].state.money)));
await page.getByRole('button', { name: 'Back' }).click();
await menu();

// ---- Signing out goes back to the guest, with the guest games
await page.locator('.signin-btn').click();
await buttonSays('sign in with google');
check('after signing out you are a guest again', /guest/i.test(await page.locator('.who-sub').innerText()) && /sign in with google/i.test(await page.locator('.signin-btn').innerText()));
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
check('the guest slots are the guest games', /gus/i.test(await slot(1).innerText()) && (await page.locator('.slot-where').count()) === 0);
await page.getByRole('button', { name: 'Back' }).click();
await menu();

// ---- Signing in again does not repeat the offer
await page.locator('.signin-btn').click();
await buttonSays('sign out');
check('the guest games are offered only once per account', (await page.locator('.title-screen.guest-games').count()) === 0 && /cloud/i.test(await page.locator('.who-sub').innerText()));

// ---- A second account cannot take the same username
await page.locator('.signin-btn').click(); // sign out
await buttonSays('sign in with google');
await fake((f) => { f.next = 'u2'; });
await page.locator('.signin-btn').click();
await page.waitForSelector('.title-screen.character', { timeout: 10000 });
check('a taken username sends the new account to its profile with a message', /taken/i.test(await page.locator('.form-error').innerText()) && /profile/i.test(await page.locator('.title-panel h2').innerText()));
await page.screenshot({ path: out + 'cloud-taken.png' });
await page.locator('.name-input').fill('GUESTY');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForFunction(() => /taken/i.test(document.querySelector('.form-error')?.textContent ?? ''), null, { timeout: 5000 });
check('the same name in other letters is still taken', /taken/i.test(await page.locator('.form-error').innerText()) && (await page.locator('.title-screen.main').count()) === 0);
await page.locator('.name-input').fill('Hank');
await page.getByRole('button', { name: 'Save' }).click();
await menu();
check('another name is accepted and kept with the account', (await fake((f) => f.profiles.u2?.username)) === 'Hank' && (await page.locator('.who-name').textContent()) === 'Hank');

// ---- Each account has its own games
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
check('the second account starts with empty slots', (await page.locator('.slot-empty').count()) === 3);

// ---- A game made on another device shows up
await G(async () => {
  const m = await import('/src/sim/state.ts');
  const g = m.createNewGame(77);
  g.character.name = 'Remote';
  g.money = 123456;
  window.__fake.saves.u2 = { 2: { version: m.SAVE_VERSION, savedAt: Date.now() + 5000, state: g } };
});
await page.getByRole('button', { name: 'Back' }).click();
await menu();
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
check('a cloud game from another device appears in its slot', /remote/i.test(await slot(2).innerText()) && /saved to the cloud/i.test(await slot(2).innerText()));
await slot(2).getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(2500);
check('and it can be played', (await G(() => window.__game.state.character.name)) === 'Remote' && (await G(() => window.__game.state.money)) === 123456);
await exitToTitle();

// ---- Deleting takes the game out of the cloud
await page.getByText('Single player').click();
await page.waitForSelector('.title-screen.slots');
await slot(2).getByRole('button', { name: 'Delete this game' }).click();
await slot(2).getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForTimeout(800);
const gone = await fake((f) => f.saves.u2?.[2]);
const emptyNow = await slot(2).locator('.slot-empty').count();
check('deleting a game removes the cloud copy', gone === undefined && emptyNow === 1, `(cloud ${gone === undefined ? 'empty' : 'still there'}, empty slot cards: ${emptyNow})`);

console.log('--- console errors ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
