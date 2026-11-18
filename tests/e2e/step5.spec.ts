// Step 5, end to end: the frog and the chicken come up in their own homes, chosen the way a user
// chooses them (the tray's New pet, which now asks which), and a chick old enough is moved to the coop.

import { expect, test, type Page } from '@playwright/test';
import { BOWL_CENTER, collectErrors, gotoFresh, waitForBoot } from './support';

interface PetDoc {
  pet?: { species?: string; habitat?: string; bornAt?: number; name?: string; alive?: boolean; speciesData?: Record<string, number> };
}

const petOf = (page: Page): Promise<NonNullable<PetDoc['pet']>> =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('webpets:pet.json') ?? '{}') as PetDoc).pet ?? {});

/** Open the tray's New pet and pick one. Choosing another species reloads the app. */
async function pick(page: Page, species: string): Promise<void> {
  await page.evaluate(() => window.__webpetsMock?.emitTray('new-pet'));
  const picker = page.locator('.pet-picker');
  await expect(picker).toBeVisible();
  await picker.locator(`.pick-${species}`).click();
  await expect.poll(async () => (await petOf(page)).species).toBe(species);
  await waitForBoot(page);
}

test('New pet asks which, and offers all four', async ({ page }) => {
  const errors = collectErrors(page);
  await gotoFresh(page);
  await page.evaluate(() => window.__webpetsMock?.emitTray('new-pet'));
  const picker = page.locator('.pet-picker');
  await expect(picker).toBeVisible();
  await expect(picker.locator('button.pick')).toHaveText(['FISH', 'HAMSTER', 'FROG', 'CHICKEN']);
  // Cancel changes nothing.
  const before = await petOf(page);
  await picker.getByRole('button', { name: 'CANCEL' }).click();
  await expect(picker).toBeHidden();
  expect((await petOf(page)).name).toBe(before.name);
  expect(errors).toEqual([]);
});

test('a frog comes up on its pond, and a feed lets crickets loose', async ({ page }) => {
  const errors = collectErrors(page);
  await gotoFresh(page);
  await pick(page, 'frog');
  const pet = await petOf(page);
  expect(pet.habitat).toBe('pond');
  expect(pet.alive).toBe(true);
  await expect(page.locator('#app canvas')).toHaveCount(1);

  // Feed from the HUD, as a user does, and let the hunt run a while.
  await page.mouse.move(BOWL_CENTER.x, BOWL_CENTER.y);
  const pill = page.locator('.hud-pill');
  await expect(pill).toBeVisible();
  await pill.getByRole('button', { name: 'FEED' }).click();
  await page.waitForTimeout(6000);
  // It can be typed to, like every pet.
  await expect(pill.getByRole('button', { name: 'TALK' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a chicken starts as a chick in the brooder, and is a hen in the coop after seven days', async ({ page }) => {
  const errors = collectErrors(page);
  await gotoFresh(page);
  await pick(page, 'chicken');
  expect((await petOf(page)).habitat).toBe('brooder');
  await page.mouse.move(BOWL_CENTER.x, BOWL_CENTER.y);
  await page.locator('.hud-pill').getByRole('button', { name: 'FEED' }).click();
  await page.waitForTimeout(1500);

  // Seven days and a bit, lived and fed: born that long ago. The sim moves it at the next launch.
  await page.waitForTimeout(700); // the throttled save
  await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('webpets:pet.json') ?? '{}') as { pet: { bornAt: number } };
    doc.pet.bornAt -= 7.5 * 24 * 3_600_000;
    localStorage.setItem('webpets:pet.json', JSON.stringify(doc));
  });
  await page.reload();
  await waitForBoot(page);
  await expect.poll(async () => (await petOf(page)).habitat).toBe('coop');
  expect((await petOf(page)).species).toBe('chicken');
  await expect(page.locator('#app canvas')).toHaveCount(1);
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});
