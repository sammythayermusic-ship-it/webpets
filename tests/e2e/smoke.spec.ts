// Fast smoke: the built app boots in browser mode, the bowl canvas exists at the contract size, no errors.

import { expect, test } from '@playwright/test';
import { BOOT_WINDOW, collectErrors, waitForBoot } from './support';

test('boots into the bowl with no console errors', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/');
  await waitForBoot(page);

  const canvas = page.locator('#app canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveCSS('width', `${BOOT_WINDOW.width}px`);
  await expect(canvas).toHaveCSS('height', `${BOOT_WINDOW.height}px`);
  // The mock tray chip exists but is only shown while the window is minimized.
  await expect(page.locator('#mock-tray')).toBeHidden();

  // Let a few animation frames run so any render-time error would surface.
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
