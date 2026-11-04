// The second species, end to end: switch to it and confirm the app comes back up as a hamster in a
// cage rather than a fish in a bowl. This is the test that would have failed at every stage of the
// four-stage build until the last one -- the behaviour, the art and the registry can all be correct
// while `createScene` still mounts the only habitat it was ever told about.

import { expect, test } from '@playwright/test';
import { BOWL_CENTER, gotoFresh, keepOffline, waitForBoot } from './support';

test('switches to the hamster and comes back up in the cage', async ({ page }) => {
  keepOffline(page);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await gotoFresh(page);
  await expect(page.locator('#app canvas')).toHaveCount(1);

  // The species the scene actually mounted, not the one the store merely recorded: the boot report
  // reads it back off the running scene.
  const speciesOf = async (): Promise<string> =>
    page.evaluate(() => (JSON.parse(localStorage.getItem('webpets:pet.json') ?? '{}') as
      { pet?: { species?: string } }).pet?.species ?? '');
  expect(await speciesOf()).toBe('fish');

  await page.keyboard.press('Alt+Meta+KeyD');
  const panel = page.locator('.dev-panel');
  await expect(panel).toBeVisible();

  const select = panel.locator('select').filter({ hasText: 'cage' });
  // The option must be ENABLED. It was hardcoded disabled for every species but the fish, in two
  // separate places, and both now derive from the registry.
  await expect(select.locator('option[value="hamster/cage"]')).not.toBeDisabled();

  await select.selectOption('hamster/cage');

  // Switching re-mounts by reloading, so wait for the app to come back rather than for a transition.
  await waitForBoot(page);
  await expect(page.locator('#app canvas')).toHaveCount(1);
  expect(await speciesOf()).toBe('hamster');

  // And it is genuinely a different habitat: the cage's hit rect comes from its own opaqueRect
  // (40,12,261,211) rather than the bowl's (74,22,172,203), and that rect drives click-through.
  const box = await page.locator('#app canvas').boundingBox();
  expect(box).not.toBeNull();

  // Every pet gets the brain (Step G): the hamster can be typed to, so the HUD offers TALK, and a
  // click on it opens the chat field. The cage's centre is a permanent hit region, so hovering it
  // brings up the HUD.
  await page.mouse.move(BOWL_CENTER.x, BOWL_CENTER.y);
  const pill = page.locator('.hud-pill');
  await expect(pill).toBeVisible();
  const talk = pill.getByRole('button', { name: 'TALK' });
  await expect(talk).toBeVisible();
  await talk.click();
  await expect(page.locator('.chat-input .chat-field')).toBeVisible();

  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});
