// Step 5's look-over, in headless Chromium against a dev server (nothing takes the screen): each new
// habitat by day and by night, the frog's hunt frame by frame, the nest with eggs in it.
//
//   node tools/mac/step5_stills.mjs <base-url> <out-dir> [frog/pond,frog/jar,chicken/brooder,chicken/coop]
//
// Stills are the scene's own snapshot (habitat canvas, 2x), saved as <out-dir>/<species>-<habitat>-<what>.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [base, out, which] = process.argv.slice(2);
if (!base || !out) {
  console.error('usage: step5_stills.mjs <base-url> <out-dir> [pairs]');
  process.exit(2);
}
const pairs = (which ?? 'frog/pond,frog/jar,chicken/brooder,chicken/coop').split(',').map((p) => p.split('/'));
mkdirSync(out, { recursive: true });
const log = (...a) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...a);

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 688, height: 528 }, deviceScaleFactor: 2 });
await context.addInitScript(() => {
  let s = 0x9e3779b9;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const ready = () => page.waitForFunction(() => window.__webpets?.store?.getState().hydrated && window.__webpets.scene.debugState().hasView, null, { timeout: 30_000 });
const A = (fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => page.waitForTimeout(ms);
const snap = async (name) => {
  const url = await A(() => window.__webpets.scene.snapshot());
  writeFileSync(join(out, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
};
const state = () => A(() => {
  const d = window.__webpets.scene.debugState();
  return { anim: d.petAnim, act: d.petAct, pos: d.petPos, ambient: d.ambient };
});

for (const [species, habitat] of pairs) {
  const tag = `${species}-${habitat}`;
  await page.goto(base);
  await ready();
  const cur = await A(() => window.__webpets.store.getState().pet);
  if (!cur.alive) {
    await A(() => window.__webpets.store.getState().actions.newPet());
    await sleep(300);
  }
  if (cur.species !== species || cur.habitat !== habitat) {
    await A(([s, h]) => window.__webpets.store.getState().actions.dev.setSpecies(s, h), [species, habitat]);
    await sleep(1500);
    await ready();
  }
  await A(() => {
    const a = window.__webpets.store.getState().actions;
    a.dev.setHunger(100);
    a.dev.setNightOverride(13);
    return a.setScale(16);
  });
  await sleep(4000);
  await snap(`${tag}-day`);
  log(tag, 'day', JSON.stringify(await state()));

  if (species === 'frog') {
    await A(() => window.__webpets.store.getState().actions.feed());
    for (let i = 0; i < 90; i += 1) {
      await sleep(110);
      const st = await state();
      if (st.act === 'snap' || i % 15 === 0) {
        await snap(`${tag}-hunt-${String(i).padStart(2, '0')}`);
        log(tag, 'hunt', i, JSON.stringify(st));
      }
    }
    log(tag, 'caught', JSON.stringify(await A(() => window.__webpets.scene.drainSpeciesDelta())));
  } else {
    if (habitat === 'coop') await A(() => window.__webpets.store.getState().actions.addSpeciesData({ eggs: 4 }));
    await A(() => window.__webpets.store.getState().actions.feed());
    for (let i = 0; i < 4; i += 1) {
      await sleep(1500);
      await snap(`${tag}-feed-${i}`);
      log(tag, 'feed', i, JSON.stringify(await state()));
    }
  }
  for (const [name, hour] of [['dawn', 6.5], ['dusk', 19.25], ['night', 23]]) {
    await A((h) => window.__webpets.store.getState().actions.dev.setNightOverride(h), hour);
    await sleep(name === 'night' ? 9000 : 3500);
    await snap(`${tag}-${name}`);
    log(tag, name, JSON.stringify(await state()));
  }
  await A(() => window.__webpets.store.getState().actions.dev.forceState('dead'));
  await sleep(2500);
  await snap(`${tag}-dead`);
  await A(() => {
    const a = window.__webpets.store.getState().actions;
    a.newPet();
    a.dev.setNightOverride(null);
  });
  await sleep(1200);
}
if (errors.length > 0) log('PAGE ERRORS', JSON.stringify(errors));
else log('no page errors');
await browser.close();
