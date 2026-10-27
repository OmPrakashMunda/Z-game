/**
 * Getting past the title screens, the way a player does. Every test that needs a running game starts with newGame(), and
 * continues a saved one with continueGame(). The first visit to the game in a browser asks for a username; later visits go
 * straight to the main menu.
 */

async function toMainMenu(page) {
  await page.waitForSelector('.title-screen', { timeout: 30000 });
  if ((await page.locator('.title-screen.character').count()) > 0) {
    await page.locator('.name-input').fill('Tester');
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await page.waitForSelector('.title-screen.main', { timeout: 30000 });
}

async function toSlots(page) {
  await toMainMenu(page);
  await page.getByText('Single player').click();
  await page.waitForSelector('.title-screen.slots');
}

/**
 * Start a new game in a save slot. If the slot already holds a game, it is replaced.
 * Options: slot (1 to 3), name (the survivor's name), gender ('male' or 'female').
 */
export async function newGame(page, { slot = 1, name, gender } = {}) {
  await toSlots(page);
  await page.locator(`.slot[data-slot="${slot}"]`).getByRole('button', { name: 'New game' }).click();
  const sure = page.getByRole('button', { name: 'Start new game' });
  if (await sure.isVisible().catch(() => false)) await sure.click();
  await page.waitForSelector('.title-screen.character');
  if (gender === 'female') await page.getByRole('button', { name: /Woman/ }).click();
  if (gender === 'male') await page.getByRole('button', { name: /Man/ }).click();
  if (name) await page.locator('.name-input').fill(name);
  await page.getByRole('button', { name: 'Start game' }).click();
}

/** Open the game saved in a slot. */
export async function continueGame(page, slot = 1) {
  await toSlots(page);
  await page.locator(`.slot[data-slot="${slot}"]`).getByRole('button', { name: 'Continue' }).click();
}
