// Checkpoint 4's before/after takes, recorded in headless Chromium against a dev server, so they
// need neither the screen nor the harness app (whose window macOS throttles to a standstill when it
// is off screen). Browser-mode frames match the app's (docs/DECISIONS.md, 2026-10-28: 1.1% of pixels
// differ, all inside the moving fish).
//
//   node tools/mac/record_animation_browser.mjs <base-url> <out-dir> <tag> [hamster,fish]
//
// The same steps, with Math.random seeded the same way, for each tag: wander, a tap on the glass, a
// feed, bedtime, waking, and for the hamster the wheel and a death. Each clip is the habitat canvas
// (canvas.captureStream + MediaRecorder), saved as <out-dir>/<tag>-<pet>-<step>.webm.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [base, out, tag, petsArg] = process.argv.slice(2);
if (!base || !out || !tag) {
  console.error('usage: record_animation_browser.mjs <base-url> <out-dir> <tag> [hamster,fish]');
  process.exit(2);
}
const pets = (petsArg ?? 'hamster,fish').split(',');
mkdirSync(out, { recursive: true });
const log = (...a) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${tag}`, ...a);

const browser = await chromium.launch({ args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 688, height: 528 }, deviceScaleFactor: 2 });
// The same pseudo-random stream in both takes, so the pets start from the same choices.
await context.addInitScript(() => {
  let s = 0x9e3779b9;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});
// A team on the profile, so a forced win has someone to cheer for (the wheel step).
await context.addInitScript(() => {
  try {
    if (!localStorage.getItem('webpets:profile.json')) {
      localStorage.setItem('webpets:profile.json', JSON.stringify({ version: 1, name: 'Sam', teams: ['nba:2'], interests: [], own: [], updatedAt: Date.now() }));
    }
  } catch {
    /* storage blocked: the wheel step is skipped */
  }
});
const page = await context.newPage();
page.on('pageerror', (e) => log('page error', e.message));

const ready = async () => {
  await page.waitForFunction(() => window.__webpets?.store?.getState().hydrated && window.__webpets.scene.debugState().hasView, null, { timeout: 30_000 });
};
const A = (fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => page.waitForTimeout(ms);

async function setup(species, habitat) {
  await page.goto(base);
  await ready();
  const cur = await A(() => window.__webpets.store.getState().pet);
  if (cur.species !== species || cur.habitat !== habitat || !cur.alive) {
    if (!cur.alive) await A(() => window.__webpets.store.getState().actions.newPet());
    await A(([s, h]) => window.__webpets.store.getState().actions.dev.setSpecies(s, h), [species, habitat]);
    await page.waitForLoadState('load');
    await sleep(1500);
    await ready();
  }
  await A(async () => {
    const a = window.__webpets.store.getState().actions;
    await a.setScale(16);
    a.dev.setNightOverride(12);
    a.dev.setHunger(70);
    a.dev.setPantry(150);
    a.dev.setNeeds({ energy: 1, stress: 0 });
  });
  await sleep(3000);
}

async function clip(pet, step, seconds) {
  const st = await A(() => {
    const d = window.__webpets.scene.debugState();
    return `${d.petAnim}/${d.petAct ?? '-'} @${Math.round(d.petPos?.x ?? 0)}`;
  });
  log(`record ${pet}-${step} ${seconds}s :: ${st}`);
  const dataUrl = await A(async (sec) => {
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
  const b64 = String(dataUrl).replace(/^data:[^,]*,/, '');
  writeFileSync(join(out, `${tag}-${pet}-${step}.webm`), Buffer.from(b64, 'base64'));
}

async function tapNearPet() {
  await A(() => {
    const W = window.__webpets;
    const d = W.scene.debugState();
    const f = W.store.getState().settings.scale / 8;
    const x = 24 + d.drawnPos.x * f;
    const y = 24 + (d.drawnPos.y - 10) * f;
    W.store.getState().actions.poke('tap');
    W.scene.tap(x, y);
  });
}

async function sequence(pet) {
  await clip(pet, 'wander', 14);
  await tapNearPet();
  await clip(pet, 'tap', 6);
  await A(() => window.__webpets.store.getState().actions.feed());
  await clip(pet, 'eat', 14);
  await A(() => window.__webpets.store.getState().actions.dev.setNightOverride(22));
  await clip(pet, 'bed', 14);
  await A(() => {
    const a = window.__webpets.store.getState().actions;
    a.dev.setNightOverride(12);
    a.dev.setNeeds({ energy: 1 });
  });
  await clip(pet, 'wake', 8);
}

if (pets.includes('hamster')) {
  await setup('hamster', 'terrarium');
  await sequence('hamster');
  // The wheel: a forced win sends it on a victory sprint every 25 s of cheering.
  const won = await A(() => {
    const w = window.__webpets.speech?.world?.();
    try {
      return w ? w.forceResult('won', 112, 104) : false;
    } catch {
      return false;
    }
  });
  if (won) {
    await sleep(24_000);
    await clip('hamster', 'wheel', 14);
  } else {
    log('no team on the profile: the wheel step is skipped');
  }
  await A(() => window.__webpets.store.getState().actions.dev.forceState('dead'));
  await clip('hamster', 'die', 6);
  await A(() => window.__webpets.store.getState().actions.newPet());
}
if (pets.includes('fish')) {
  await setup('fish', 'bowl');
  await sequence('fish');
}
await browser.close();
log('done');
