// Shared helpers for the browser-mode e2e specs. The app under test is the built `dist/` served by
// `vite preview`; the platform is the browser mock (`src/platform/browser.ts`), whose test hooks live on
// `window.__webpetsMock` (typed globally by `src/platform/mock.d.ts`).

import { expect, type Page } from '@playwright/test';
import { DEFAULT_SCALE, GRID_H, GRID_W, WINDOW_PAD, scaleFactor, windowSizeForScale } from '../../src/sim/constants';

/** Habitat grid scale the app boots at (settings default). */
export const BOOT_SCALE = DEFAULT_SCALE;
/** Contract window (and canvas) size at the boot scale, in CSS px. */
export const BOOT_WINDOW = windowSizeForScale(BOOT_SCALE);
/**
 * Window-local CSS px of the bowl's centre at the boot scale: pad + petAnchor * scale. The bowl's
 * `petAnchor` is the centre of the grid, so deriving it from the grid keeps this in step with a
 * resolution change without reaching into the render-owned manifest.
 */
export const BOWL_CENTER = {
  // Through scaleFactor: the scale counts EIGHTHS of the grid, so multiplying by it raw puts this
  // point several screens away and every hover in the suite silently misses the window.
  x: WINDOW_PAD + (GRID_W / 2) * scaleFactor(BOOT_SCALE),
  y: WINDOW_PAD + (GRID_H / 2) * scaleFactor(BOOT_SCALE),
};

/**
 * Keeps the page off the internet: the browser mock fetches real scoreboards and news (Step F), and a
 * test must not depend on ESPN or a feed being up, or on their CORS headers. Anything not served
 * locally gets an empty answer, which the app reads as no games and no stories.
 */
export function keepOffline(page: Page): void {
  void page.route(
    (url) => !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } }),
  );
}

/**
 * Collects uncaught page errors and console.error output for the lifetime of the page, and keeps the
 * page offline (`keepOffline`). Assert `toEqual([])` at the end of a test.
 */
export function collectErrors(page: Page): string[] {
  keepOffline(page);
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
