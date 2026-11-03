import { expect, test } from '@playwright/test';
import { keepOffline } from './support';

/**
 * The resize handle, end to end. None of this is reachable from a unit test: it needs a real pointer
 * capture, a real window and the hit-region machinery that decides whether the handle can be clicked
 * at all.
 *
 * The handle is a DOM element rather than something drawn into the canvas for a specific reason, and
 * this test is what would catch it regressing: the app starts a native window drag on any mousedown
 * over the canvas, so a handle drawn there could be pressed but never dragged.
 */

const canvasSize = async (page: import('@playwright/test').Page): Promise<{ w: number; h: number }> =>
  page.evaluate(() => {
    const c = document.querySelector('#habitat-canvas') as HTMLCanvasElement | null;
    if (!c) throw new Error('no habitat canvas');
    return { w: c.clientWidth, h: c.clientHeight };
  });

/** Grid aspect, which the window must keep at every size: a single scale drives both axes. */
const ASPECT = 320 / 240;
const PAD = 48;

test('the corner handle resizes the habitat, keeping its shape and whole pixels', async ({ page }) => {
  keepOffline(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForSelector('#habitat-canvas');
  await page.waitForTimeout(1500);

  const drag = async (dx: number, dy: number): Promise<{ w: number; h: number }> => {
    const s = await canvasSize(page);
    // Hover the habitat so the chrome appears; the handle is hidden until then, like the rest.
    await page.mouse.move(Math.round(s.w / 2), Math.round(s.h / 2));
    await page.waitForTimeout(400);
    const box = await page.locator('.resize-grip').boundingBox();
    expect(box, 'the resize handle must be visible while hovering the habitat').not.toBeNull();
    const cx = (box as { x: number; width: number }).x + (box as { width: number }).width / 2;
    const cy = (box as { y: number; height: number }).y + (box as { height: number }).height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await page.mouse.move(cx + (dx * i) / 12, cy + (dy * i) / 12);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    return canvasSize(page);
  };

  const before = await canvasSize(page);
  // Up and to the left grows it: resizing pins the window's bottom-right corner.
  const bigger = await drag(-100, -75);
  expect(bigger.w, 'dragging out from the corner grows the habitat').toBeGreaterThan(before.w);
  const smaller = await drag(150, 112);
  expect(smaller.w, 'dragging back in shrinks it').toBeLessThan(bigger.w);

  for (const s of [before, bigger, smaller]) {
    // One scale drives both axes, so the shape can never drift however the cursor moves.
    expect((s.w - PAD) / (s.h - PAD), `aspect at ${s.w}x${s.h}`).toBeCloseTo(ASPECT, 9);
    // Whole pixels, because the scale counts eighths of a grid that divides by eight. A fractional
    // size would mean Rust and the frontend needing matching rounding rules, and a one-pixel
    // disagreement silently stops the click-through region matching the art.
    expect(Number.isInteger(s.w) && Number.isInteger(s.h), `whole pixels at ${s.w}x${s.h}`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('the bar has size buttons that step and stop at the ends', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#habitat-canvas');
  await page.waitForTimeout(1500);
  const s0 = await canvasSize(page);
  await page.mouse.move(Math.round(s0.w / 2), Math.round(s0.h / 2));
  await page.waitForTimeout(400);

  const pill = page.locator('.hud-pill');
  await pill.getByRole('button', { name: '+', exact: true }).click();
  await page.waitForTimeout(300);
  const grown = await canvasSize(page);
  expect(grown.w).toBeGreaterThan(s0.w);

  await pill.getByRole('button', { name: '−', exact: true }).click();
  await page.waitForTimeout(300);
  expect((await canvasSize(page)).w).toBe(s0.w);
});
