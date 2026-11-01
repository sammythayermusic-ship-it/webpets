// Phase 0 acceptance recording (Blueprint section 11) in browser mode. One test, one video (~60 s), driven
// through the real UI (hover HUD, FEED, dev panel via Alt+Meta+D, keyboard scale) plus the mock's hooks for the
// parts Rust owns under Tauri (toggle-visibility, notifications). Timings follow the contract's "Acceptance
// script notes": the pet eats twice a day, so from a fresh pet hunger hits 30 at 16.8 h, 0 at 24 h and death
// at 36 h. The dev panel only offers +1H / +12H / +3D, which is why the walk to "hungry" is 12 h plus five
// single hours rather than one clean press.

import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  BOOT_WINDOW,
  BOOT_SCALE,
  BOWL_CENTER,
  collectErrors,
  gotoFresh,
  mockNotifications,
  mockToggleVisibility,
  waitForBoot,
} from './support';
import { windowSizeForScale } from '../../src/sim/constants';
import { SCALE_STEP } from '../../src/ui/keys';

/** Short pause so the recording shows a state before the script moves on. */
const BEAT_MS = 1500;

class DevPanel {
  readonly panel: Locator;
  readonly status: Locator;

  constructor(private readonly page: Page) {
    this.panel = page.locator('.dev-panel');
    this.status = this.panel.locator('.status');
  }

  async open(): Promise<void> {
    if (!(await this.panel.isVisible())) await this.page.keyboard.press('Alt+Meta+KeyD');
    await expect(this.panel).toBeVisible();
  }

  async close(): Promise<void> {
    if (await this.panel.isVisible()) await this.page.keyboard.press('Alt+Meta+KeyD');
    await expect(this.panel).toBeHidden();
  }

  /** The `.row` whose label is exactly `label` (rows are `<label>` + controls). */
  row(label: string): Locator {
    return this.panel
      .locator('.row')
      .filter({ has: this.page.locator('label', { hasText: new RegExp(`^${label}$`) }) });
  }

  async skip(button: '+1H' | '+12H' | '+3D', times = 1): Promise<void> {
    const b = this.row('SKIP').getByRole('button', { name: button, exact: true });
    for (let i = 0; i < times; i += 1) await b.click();
  }

  async setNumber(label: 'HUNGER' | 'PANTRY', value: number): Promise<void> {
    const row = this.row(label);
    await row.locator('input').fill(String(value));
    await row.getByRole('button', { name: 'APPLY', exact: true }).click();
  }
}

test.describe.configure({ mode: 'serial' });

test('Phase 0 acceptance walk-through', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const dev = new DevPanel(page);
  const pill = page.locator('.hud-pill');
  const caption = page.locator('.hud-caption');
  const pct = pill.locator('.pct');
  const petId = pill.locator('.id');
  const ring = pill.locator('.ring-fg');
  const canvas = page.locator('#app canvas');

  /** Move the pointer over the bowl (a permanent hit region) so the hover HUD appears. */
  const hoverBowl = async (): Promise<void> => {
    await page.mouse.move(BOWL_CENTER.x, BOWL_CENTER.y);
    await expect(pill).toBeVisible();
    await expect(caption).toBeVisible();
  };

  await test.step('launch: bowl renders, no console errors', async () => {
    await gotoFresh(page);
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toHaveCSS('width', `${BOOT_WINDOW.width}px`);
    await page.waitForTimeout(2 * BEAT_MS); // fish swimming
    expect(errors).toEqual([]);
  });

  let firstPetId = '';
  await test.step('hover shows the HUD', async () => {
    await hoverBowl();
    await expect(pct).toHaveText('100%');
    await expect(ring).toHaveClass(/ring-full/);
    await expect(caption).toHaveText('FEEDER EMPTY');
    firstPetId = (await petId.textContent()) ?? '';
    expect(firstPetId).toMatch(/^#\d+$/);
  });

  await test.step('FEED is free: flakes fall, the fish eats and speaks', async () => {
    const feed = pill.getByRole('button', { name: 'FEED', exact: true });
    await expect(feed).toBeEnabled();
    await feed.click();
    // The 'fed' speech line only fires on a scene `bite`, i.e. once the fish has reached a flake.
    await expect(page.locator('.speech-bubble')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('webpets:pet.json'));
      if (raw === null) return null;
      const doc = JSON.parse(raw) as { pet: { meals: number; foodEaten: number } };
      return { hasBalance: 'balance' in doc, meals: doc.pet.meals, foodEaten: doc.pet.foodEaten };
    }).toEqual({ hasBalance: false, meals: 1, foodEaten: 25 });
    await dev.open();
    await expect(dev.status).toContainText('meals 1');
    await expect(dev.status).not.toContainText('balance');
    await dev.close();
    await page.waitForTimeout(2 * BEAT_MS); // flakes dissolving / fish back to idle
  });

  await test.step('skip time: hungry (17 h), starving (29 h), dead (>36 h) with the memorial card', async () => {
    await dev.open();
    await dev.skip('+12H');
    await dev.skip('+1H', 5); // 17 h: inside the 16.8-24 h hungry band
    await expect(dev.status).toContainText(/hunger \d+\.\d% hungry/);
    await dev.close();
    await hoverBowl();
    await expect(ring).toHaveClass(/ring-hungry/);
    await page.waitForTimeout(BEAT_MS);

    await dev.open();
    await dev.skip('+12H');
    await expect(dev.status).toContainText(/hunger 0\.0% starving/);
    await dev.close();
    await hoverBowl();
    await expect(ring).toHaveClass(/ring-starving/);
    await expect(pct).toHaveText('0%');
    await page.waitForTimeout(BEAT_MS);

    await dev.open();
    await dev.skip('+3D');
    await expect(dev.status).toContainText('· dead ·');
    await dev.close();
    const memorial = page.locator('.memorial-card');
    await expect(memorial).toBeVisible();
    await expect(memorial).toContainText('In memory of');
    await expect(memorial).toContainText('MEALS 1');
    await expect(pill.getByRole('button', { name: 'FEED', exact: true })).toBeDisabled();
    await page.waitForTimeout(BEAT_MS); // belly-up fish + card
  });

  await test.step('notifications fired for hungry, starving, dying soon and death', async () => {
    const notes = await mockNotifications(page);
    const bodies = notes.map((n) => n.body);
    expect(bodies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ is hungry\.$/),
        expect.stringMatching(/ is starving\. 12h to live\.$/),
        expect.stringMatching(/ has 6 hours\.$/),
        expect.stringMatching(/ has died\.$/),
      ]),
    );
    expect(notes.length).toBeGreaterThanOrEqual(4);
  });

  await test.step('New pet from the memorial card', async () => {
    await page.locator('.memorial-card').getByRole('button', { name: 'NEW PET', exact: true }).click();
    await expect(page.locator('.memorial-card')).toBeHidden();
    await hoverBowl();
    await expect(pct).toHaveText('100%');
    await expect(petId).not.toHaveText(firstPetId);
    await page.waitForTimeout(BEAT_MS);
  });

  await test.step('the holiday feeder: free, fills to three days', async () => {
    await page.evaluate(() => window.__webpetsMock?.emitTray('pantry'));
    const feeder = page.locator('.feeder-dialog');
    await expect(feeder).toBeVisible();
    await expect(feeder).toContainText('Holiday feeder');
    await expect(feeder).toContainText('EMPTY');
    await expect(feeder).toContainText("while you're away.");
    const fill = feeder.getByRole('button', { name: 'FILL IT UP', exact: true });
    await expect(fill).toBeEnabled();
    await fill.click();
    await expect(feeder).toContainText('3 DAYS OF FOOD');
    await expect(fill).toBeDisabled();
    await page.waitForTimeout(BEAT_MS);
    await feeder.getByRole('button', { name: 'CLOSE', exact: true }).click();
    await expect(feeder).toBeHidden();
    await hoverBowl();
    await expect(caption).toHaveText('FEEDER · 3 DAYS');
    await dev.open();
    await expect(dev.status).toContainText('pantry 150');
    await dev.close();
  });

  await test.step('1000 in the pantry (dev), 10 days: alive, pantry 525, 19 auto-feeds', async () => {
    await dev.open();
    // Dry run first: the event list for exactly this scenario.
    await dev.row('SIM').getByRole('button').click();
    const output = dev.panel.locator('pre');
    await expect(output).toContainText('over 10d with 1000 in the pantry');
    const lines = ((await output.textContent()) ?? '').split('\n').filter((l) => l.includes('ate from the feeder'));
    expect(lines).toHaveLength(19);

    // Then for real. Nineteen meals, not eight: the first lands on the hungry crossing at 16.8 h and
    // every one after it is twelve hours later.
    await dev.setNumber('PANTRY', 1000);
    await expect(dev.status).toContainText('pantry 1000');
    await dev.skip('+3D', 3);
    await dev.skip('+12H', 2);
    await expect(dev.status).toContainText('· alive ·');
    await expect(dev.status).toContainText('pantry 525');
    await dev.close();
    await hoverBowl();
    await expect(caption).toHaveText('FEEDER · 10 DAYS');
    await expect(pct).not.toHaveText('0%');
    await page.waitForTimeout(BEAT_MS);
  });

  await test.step('Skip 3d on next launch + relaunch: montage plays, hunger reflects elapsed time', async () => {
    await dev.open();
    await dev.row('LAUNCH').getByRole('button', { name: 'SKIP 3D ON NEXT LAUNCH', exact: true }).click();
    await expect(dev.row('LAUNCH').locator('.note')).toHaveText('armed: quit and relaunch');
    await dev.close();

    await page.reload();
    await waitForBoot(page);
    const montage = page.locator('.montage');
    await expect(montage).toBeVisible();
    await expect(montage).toContainText('While you were gone');
    // Lines land one per 700 ms; three days at two meals a day is six meals from the feeder.
    await expect(montage.locator('li').filter({ hasText: 'ate from the feeder' })).toHaveCount(6, { timeout: 12_000 });
    await page.waitForTimeout(BEAT_MS);
    await montage.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    await expect(montage).toBeHidden();
    await expect(page.locator('.speech-bubble')).toBeVisible(); // 'wake' line

    await dev.open();
    // The dev clock offset is cumulative across the run: 101 h (death sequence) + 10 d + 3 d (this relaunch)
    // = 413 h.
    await expect(dev.status).toContainText('offset +17d 5h');
    await expect(dev.status).toContainText('pantry 375');
    await dev.close();
    await hoverBowl();
    const shown = Number.parseInt((await pct.textContent()) ?? '', 10);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(100);
    await page.waitForTimeout(BEAT_MS);
  });

  await test.step('Cmd+= / Cmd+- change the window size, a step at a time', async () => {
    // The ladder is continuous now, so a press is a step rather than a jump to the next named rung.
    const boot = `${BOOT_WINDOW.width}px`;
    const up = `${windowSizeForScale(BOOT_SCALE + SCALE_STEP).width}px`;
    const upTwice = `${windowSizeForScale(BOOT_SCALE + 2 * SCALE_STEP).width}px`;
    await page.keyboard.press('Meta+Equal');
    await expect(canvas).toHaveCSS('width', up);
    await expect(page.locator('#app')).toHaveCSS('width', up);
    await page.keyboard.press('Meta+Equal');
    await expect(canvas).toHaveCSS('width', upTwice);
    await page.waitForTimeout(BEAT_MS);
    await page.keyboard.press('Meta+Minus');
    await page.keyboard.press('Meta+Minus');
    await expect(canvas).toHaveCSS('width', boot);
    await expect(page.locator('#app')).toHaveCSS('width', boot);
  });

  await test.step('minimize to the tray chip and back', async () => {
    await mockToggleVisibility(page);
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('#mock-tray')).toBeVisible();
    await page.waitForTimeout(BEAT_MS);
    await mockToggleVisibility(page);
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#mock-tray')).toBeHidden();
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(BEAT_MS);
  });

  expect(errors).toEqual([]);
});
