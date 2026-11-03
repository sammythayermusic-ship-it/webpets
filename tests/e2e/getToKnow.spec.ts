// Step E in the browser: the "Get to know me" card from the menu, then typing to the pet, which asks
// before it keeps anything and keeps it when you press Yes.

import { expect, test } from '@playwright/test';
import { BOWL_CENTER, collectErrors, gotoFresh } from './support';

test('the card saves who you are, and the pet asks before it remembers what you tell it', async ({ page }) => {
  const errors = collectErrors(page);
  await gotoFresh(page);
  const profile = (): Promise<{ name: string | null; teams: string[]; interests: string[] } | null> =>
    page.evaluate(() => JSON.parse(localStorage.getItem('webpets:profile.json') ?? 'null'));

  await test.step('open the card from the menu and fill it in', async () => {
    await page.mouse.click(BOWL_CENTER.x, BOWL_CENTER.y, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Get to know me…' }).click();
    const card = page.locator('.gtk-card');
    await expect(card).toBeVisible();
    await card.getByPlaceholder('Your name').fill('sam');
    await card.getByPlaceholder('Your name').press('Enter');
    await card.getByRole('combobox', { name: 'League' }).selectOption('mlb');
    await card.getByRole('combobox', { name: 'Team' }).selectOption({ label: 'Boston Red Sox' });
    await card.getByRole('button', { name: 'Add' }).first().click();
    await card.getByRole('button', { name: 'baking', exact: true }).click();
    await expect.poll(async () => (await profile())?.name).toBe('Sam');
    await expect.poll(async () => (await profile())?.teams).toEqual(['mlb:2']);
    await expect.poll(async () => (await profile())?.interests).toEqual(['baking']);
    // Forget me asks first, and Keep it backs out.
    await expect(card.getByRole('button', { name: 'Keep it' })).toBeHidden();
    await card.getByRole('button', { name: 'Forget me' }).click();
    await expect(card.getByRole('button', { name: 'Forget me' })).toBeHidden();
    await card.getByRole('button', { name: 'Keep it' }).click();
    await expect(card.getByRole('button', { name: 'Forget me' })).toBeVisible();
    expect((await profile())?.name).toBe('Sam');
    await card.getByRole('button', { name: 'Done' }).click();
    await expect(card).toHaveCount(0);
  });

  await test.step('type to the pet; it asks, and Yes keeps it', async () => {
    await page.mouse.move(BOWL_CENTER.x, BOWL_CENTER.y);
    await page.locator('#ui .talk').click();
    const field = page.locator('.chat-field');
    await expect(field).toBeVisible();
    await field.fill('I love dinosaurs');
    await field.press('Enter');
    const yes = page.locator('.speech-choice', { hasText: 'Yes' });
    await expect(yes).toBeVisible();
    await expect(page.locator('.speech-text')).toContainText('dinosaurs');
    await yes.click();
    await expect.poll(async () => (await profile())?.interests).toEqual(['baking', 'dinosaurs']);
    // Pressing a button keeps the conversation going: keep typing without clicking the field again.
    await expect(field).toBeFocused();
    await page.keyboard.type('tell me a joke');
    await page.keyboard.press('Enter');
    await expect(page.locator('.speech-text')).not.toContainText('dinosaurs');
    await page.keyboard.press('Escape');
    await expect(field).toBeHidden();
  });

  expect(errors).toEqual([]);
});
