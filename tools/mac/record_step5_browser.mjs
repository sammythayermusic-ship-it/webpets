// Checkpoint 5's clips, recorded in headless Chromium against a dev server: nothing takes the screen.
//
//   node tools/mac/record_step5_browser.mjs <base-url> <out-dir> [frog,chicken]
//
// Each part is the habitat canvas (canvas.captureStream + MediaRecorder) saved as
// <out-dir>/<pet>-<nn>.webm, with its caption in <out-dir>/captions.tsv, which is what
// tools/mac/caption_clips.py joins into clip-<pet>.mp4. Math.random is seeded, so a take repeats.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [base, out, petsArg] = process.argv.slice(2);
if (!base || !out) {
  console.error('usage: record_step5_browser.mjs <base-url> <out-dir> [frog,chicken]');
  process.exit(2);
}
const pets = (petsArg ?? 'frog,chicken').split(',');
mkdirSync(out, { recursive: true });
const log = (...a) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...a);

const browser = await chromium.launch({ args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 688, height: 528 }, deviceScaleFactor: 2 });
await context.addInitScript(() => {
  let s = 0x2545f491;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});
const page = await context.newPage();
page.on('pageerror', (e) => log('page error', e.message));
const ready = () => page.waitForFunction(() => window.__webpets?.store?.getState().hydrated && window.__webpets.scene.debugState().hasView, null, { timeout: 30_000 });
const A = (fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => page.waitForTimeout(ms);
const doing = () => A(() => {
  const d = window.__webpets.scene.debugState();
  return { anim: d.petAnim, act: d.petAct ?? null, x: Math.round(d.petPos?.x ?? 0) };
});

async function setup(species, habitat) {
  await page.goto(base);
  await ready();
  const cur = await A(() => window.__webpets.store.getState().pet);
  if (cur.species !== species || cur.habitat !== habitat || !cur.alive) {
    if (!cur.alive) {
      await A(() => window.__webpets.store.getState().actions.newPet());
      await sleep(400);
    }
    await A(([s, h]) => window.__webpets.store.getState().actions.dev.setSpecies(s, h), [species, habitat]);
    await sleep(1800);
    await ready();
  }
  await A(async () => {
    const a = window.__webpets.store.getState().actions;
    await a.setScale(16);
    a.dev.setNightOverride(12);
    a.dev.setHunger(75);
    a.dev.setPantry(150);
    a.dev.setNeeds({ energy: 1, stress: 0 });
  });
  await sleep(3000);
}

const counts = {};
/** Record `seconds` of the canvas as the next part of `pet`'s clip; `during` runs while it records. */
async function part(pet, caption, seconds, during = null) {
  counts[pet] = (counts[pet] ?? 0) + 1;
  const name = `${pet}-${String(counts[pet]).padStart(2, '0')}.webm`;
  log(`record ${name} ${seconds}s :: ${JSON.stringify(await doing())} :: ${caption}`);
  const rec = A(async (sec) => {
    const c = document.querySelector('#habitat-canvas');
    const stream = c.captureStream(30);
    const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 10_000_000 });
    const chunks = [];
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.start(250);
    await new Promise((r) => setTimeout(r, sec * 1000));
    await new Promise((r) => {
      mr.onstop = r;
      mr.stop();
    });
    const blob = new Blob(chunks, { type: 'video/webm' });
    return await new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result);
      fr.readAsDataURL(blob);
    });
  }, seconds);
  if (during) await during();
  const dataUrl = await rec;
  writeFileSync(join(out, name), Buffer.from(String(dataUrl).replace(/^data:[^,]*,/, ''), 'base64'));
  appendFileSync(join(out, 'captions.tsv'), `${name}\t${caption}\n`);
}

/** Wait until the pet is doing `act` (it chooses for itself), up to `seconds`. */
async function waitFor(act, seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const d = await doing();
    if (d.act === act) return true;
    await sleep(100);
  }
  return false;
}
const feed = () => A(() => window.__webpets.store.getState().actions.feed());
const hour = (h) => A((v) => window.__webpets.store.getState().actions.dev.setNightOverride(v), h);
const pointerAt = (gx, gy) => A(([x, y]) => {
  const W = window.__webpets;
  const f = W.store.getState().settings.scale / 8;
  if (x === null) W.scene.setPointer(null, null);
  else W.scene.setPointer(24 + x * f, 24 + y * f);
}, [gx, gy]);
const tapAt = (gx, gy) => A(([x, y]) => {
  const W = window.__webpets;
  const f = W.store.getState().settings.scale / 8;
  W.store.getState().actions.poke('tap');
  W.scene.tap(24 + x * f, 24 + y * f);
}, [gx, gy]);

writeFileSync(join(out, 'captions.tsv'), '');

if (pets.includes('frog')) {
  await setup('frog', 'pond');
  await part('frog', 'The frog, on its lily pad. It blinks. Come and look, and it croaks at you.', 11, async () => {
    await sleep(4000);
    await pointerAt(215, 120);
    await sleep(6000);
    await pointerAt(null, null);
  });
  await part('frog', 'A tap on the glass: it is on the rock before you have finished.', 6, async () => {
    await sleep(1200);
    await tapAt(120, 100);
  });
  await part('frog', 'Feeding lets three crickets loose on the bank. It turns, waits for one to sit still, and takes it with its tongue.', 26, async () => {
    await sleep(1500);
    await feed();
  });
  await sleep(4000);
  await hour(19.5);
  await part('frog', 'Evening comes on, and the first fireflies.', 9);
  await hour(23);
  await sleep(7000);
  await part('frog', 'Night: asleep where it sits, fireflies over the water.', 10);
  await setup('frog', 'jar');
  await part('frog', 'Its second home, a jar. The same frog, the same hunt.', 20, async () => {
    await sleep(2500);
    await feed();
  });
}

if (pets.includes('chicken')) {
  await setup('chicken', 'brooder');
  await part('chicken', 'A new chicken is a chick, in a brooder under a heat lamp.', 14);
  await part('chicken', 'Feed drops on the straw, and it runs for it.', 14, async () => {
    await sleep(1000);
    await feed();
  });
  await sleep(16000);
  await hour(23);
  await sleep(7000);
  await part('chicken', 'At night it sleeps in the warm spot under the lamp. A moth comes to the light.', 10);
  await setup('chicken', 'coop');
  await part('chicken', 'Seven days on, it is a hen, and it has moved to the coop.', 12);
  if (await waitFor('scratch', 120)) await part('chicken', 'She scratches the litter over to see what turns up.', 6);
  if (await waitFor('chase', 240)) await part('chicken', 'A bug. She runs it down.', 7);
  if (await waitFor('dustbathe', 240)) await part('chicken', 'A dust bath, in the hollow.', 9);
  await part('chicken', 'One egg for every day she is alive and fed. They gather in the nesting box.', 13, async () => {
    for (let i = 0; i < 4; i += 1) {
      await sleep(2600);
      await A(() => window.__webpets.store.getState().actions.addSpeciesData({ eggs: 1 }));
    }
  });
  await hour(19.5);
  await sleep(2500);
  await hour(23);
  await part('chicken', 'At night she goes home, and roosts in the lit doorway.', 18);
}
await A(() => window.__webpets.store.getState().actions.dev.setNightOverride(null));
await browser.close();
log('done');
