// Shared helpers for the browser-mode e2e specs. The app under test is the built `dist/` served by
// `vite preview`; the platform is the browser mock (`src/platform/browser.ts`), whose test hooks live on
// `window.__webpetsMock` (typed globally by `src/platform/mock.d.ts`).

import { expect, type Page } from '@playwright/test';

/** Habitat grid scale the app boots at (settings default). */
export const BOOT_SCALE = 3;
/** Window-local CSS px of the bowl's centre at the boot scale: pad + petAnchor * scale. */
export const BOWL_CENTER = { x: 24 + 80 * BOOT_SCALE, y: 24 + 60 * BOOT_SCALE };

/**
 * Collects uncaught page errors and console.error output for the lifetime of the page.
 * Assert `toEqual([])` at the end of a test.
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}

/** Waits for the boot sequence to have created the canvas and the mock hooks. */
export async function waitForBoot(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__webpetsMock !== undefined);
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.locator('#ui')).toHaveCount(1);
}

/** `goto('/')`, wipe every `webpets:*` key via the mock, then reload so the run starts from a fresh pet. */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto('/');
  await waitForBoot(page);
  // Boot's own trailing (500 ms throttled) save must land before the wipe, or it would resurrect the old pet.
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const mock = window.__webpetsMock;
    if (!mock) throw new Error('window.__webpetsMock is missing (not running in browser mode?)');
    mock.reset();
  });
  await page.reload();
  await waitForBoot(page);
}

export async function mockToggleVisibility(page: Page): Promise<void> {
  await page.evaluate(() => {
    const mock = window.__webpetsMock;
    if (!mock) throw new Error('window.__webpetsMock is missing');
    mock.emitToggleVisibility();
  });
}

export async function mockNotifications(page: Page): Promise<Array<{ title: string; body: string }>> {
  return page.evaluate(() => {
    const mock = window.__webpetsMock;
    if (!mock) throw new Error('window.__webpetsMock is missing');
    return mock.notifications.map((n) => ({ title: n.title, body: n.body }));
  });
}
