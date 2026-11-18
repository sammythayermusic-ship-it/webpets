#!/usr/bin/env node
// Checkpoint 5: the acceptance walk for all four species, in the INSTALLED harness app.
//
//   node tools/mac/acceptance_walk.mjs <out-dir> [fish,hamster,frog,chicken]
//
// Everything goes through the harness's files (docs/HARNESS.md): no cursor, no keys, no Spaces, no
// screen capture, and the harness window stays where it is (desktop level, behind every window), so
// this is safe to run as a background job while the Mac is in use. Pictures are the app's own canvas
// (`snapshot`). Writes <out-dir>/walk.json and <out-dir>/walk.md, and prints each check as it lands.
//
// The walk, per species (Blueprint §11, as it stands with free food and four pets):
//   comes up      the right pet in the right home, alive, the scene advancing
//   feed          hunger goes up, a meal is counted, the pet is seen eating (the frog: a cricket caught)
//   neglect       hungry, then starving, then dead, each shown; the memorial pose
//   new pet       a new one of the same species comes up alive
//   feeder        a full holiday feeder carries it through two and a half days
//   size          small, large, and back: the window follows
//   hide / show
// and for the chicken: seven fed days move it to the coop as a hen, more days lay eggs that show in
// the nest, it roosts in the doorway at night, and all of that survives quitting the app.

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = '/Applications/WebPets Harness.app';
const HAD = join(homedir(), 'Library', 'Application Support', 'com.sammythayer.webpets.harness');
const [outArg, whichArg] = process.argv.slice(2);
if (!outArg) {
  console.error('usage: acceptance_walk.mjs <out-dir> [fish,hamster,frog,chicken]');
  process.exit(2);
}
const OUT = outArg;
mkdirSync(OUT, { recursive: true });
const HOMES = { fish: 'bowl', hamster: 'terrarium', frog: 'pond', chicken: 'brooder' };
const which = (whichArg ?? 'fish,hamster,frog,chicken').split(',');
const HOUR = 3_600_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);

/** One harness command. Returns the result's data, or null when it failed or timed out. */
function H(op, args = {}, timeoutS = 30) {
  const r = spawnSync('node', [join(REPO, 'tools', 'harness.mjs'), op, JSON.stringify(args), '--app-data', HAD, '--timeout', String(timeoutS)], { encoding: 'utf8' });
  try {
    const d = JSON.parse(r.stdout);
    return d.ok ? (d.data ?? {}) : null;
  } catch {
    return null;
  }
}
const state = () => H('state', {}, 15);
const running = () => spawnSync('pgrep', ['-f', `^${APP}/Contents/MacOS/`]).status === 0;
async function launch() {
  // `open` right after a quit can fail (-600) while the system is still putting the old one away.
  for (let i = 0; i < 6 && !running(); i += 1) {
    try {
      execFileSync('open', ['-g', APP], { stdio: 'ignore' });
    } catch {
      await sleep(1500);
    }
  }
  for (let i = 0; i < 40; i += 1) {
    await sleep(1500);
    const s = state();
    if (s?.scene?.hasView) return s;
  }
  return null;
}
async function quit() {
  spawnSync('pkill', ['-f', `^${APP}/Contents/MacOS/`]);
  for (let i = 0; i < 20 && running(); i += 1) await sleep(300);
  await sleep(1500);
}
/** Wait until the app (which reloads to change habitat) is up as this species in this home. */
async function until(test, seconds = 40) {
  const end = Date.now() + seconds * 1000;
  let s = null;
  while (Date.now() < end) {
    s = state();
    if (s && s.scene?.hasView && test(s)) return s;
    await sleep(700);
  }
  return s && test(s) ? s : null;
}
/** What the pet is drawn doing, sampled for a while: the distinct states and acts, in order. */
async function watch(seconds, stop = () => false) {
  const seen = [];
  const end = Date.now() + seconds * 1000;
  let last = null;
  while (Date.now() < end) {
    const s = state();
    if (s) {
      last = s;
      for (const k of [s.scene.petAnim, s.scene.petAct].filter(Boolean)) if (!seen.includes(k)) seen.push(k);
      if (stop(s, seen)) break;
    }
    await sleep(250);
  }
  return { seen, last };
}
function snap(name) {
  const d = H('snapshot', { name }, 30);
  const src = d?.file ? (d.file.startsWith('/') ? d.file : join(HAD, 'harness', 'out', d.file)) : join(HAD, 'harness', 'out', `${name}.png`);
  if (existsSync(src)) copyFileSync(src, join(OUT, `${name}.png`));
  return existsSync(join(OUT, `${name}.png`));
}

const results = [];
function check(species, name, pass, detail) {
  results.push({ species, name, pass: Boolean(pass), detail });
  console.log(`[${stamp()}] ${pass ? 'PASS' : 'FAIL'}  ${species.padEnd(8)} ${name.padEnd(12)} ${detail}`);
}
const label = (h) => (h <= 0 ? 'starving' : h <= 30 ? 'hungry' : 'fed');
const round = (n) => Math.round(n * 10) / 10;

async function adopt(species) {
  H('newPet', { species }, 20);
  return until((s) => s.pet.species === species && s.pet.habitat === HOMES[species] && s.pet.alive, 45);
}

async function walk(species) {
  // ---- comes up
  let s = await adopt(species);
  H('hour', { value: 12 });
  H('setNeeds', { energy: 1, stress: 0 });
  await sleep(1500);
  const stats = H('stats', { seconds: 3 }, 20);
  s = state();
  check(species, 'comes up', s && s.pet.species === species && s.pet.habitat === HOMES[species] && s.pet.alive && (stats?.stepsPerSec ?? 0) > 6,
    s ? `${s.pet.name}, a ${s.pet.species} in the ${s.pet.habitat}; ${round(stats?.stepsPerSec ?? 0)} sim steps/s, ${round(stats?.advancesPerSec ?? 0)} frames/s` : 'no answer');
  if (!s) return;
  snap(`${species}-alive`);

  // ---- feed
  H('setHunger', { n: 40 });
  const before = state();
  const fed = H('feed');
  const eating = await watch(species === 'frog' ? 30 : 25, (st, seen) => seen.includes('eat') || seen.includes('snap'));
  if (species === 'frog') snap('frog-hunting');
  // The scene banks its counters to the pet now and then, not at once: give the catch time to show.
  if (species === 'frog') await until((st) => (st.pet.speciesData?.cricketsCaught ?? 0) >= 1, 75);
  else await sleep(1500);
  const after = state();
  const caught = after?.pet.speciesData?.cricketsCaught ?? 0;
  check(species, 'feed', fed && after && after.hunger > before.hunger + 30 && after.pet.meals === before.pet.meals + 1 && (eating.seen.includes('eat') || eating.seen.includes('snap')),
    after ? `hunger ${round(before.hunger)} to ${round(after.hunger)}, meals ${before.pet.meals} to ${after.pet.meals}, seen: ${eating.seen.join(', ')}${species === 'frog' ? `; crickets caught ${caught}` : ''}` : 'no answer');
  if (species === 'frog') check(species, 'hunt', caught >= 1, `${caught} of 3 crickets caught with the tongue (a missed one escapes)`);

  // ---- neglect: hungry, starving, dead
  H('setPantry', { n: 0 });
  H('setHunger', { n: 25 });
  const hungry = await watch(8, (st) => st.scene.petAnim === 'hungry');
  const h1 = state();
  snap(`${species}-hungry`);
  H('skip', { ms: 8 * HOUR });
  await sleep(2500);
  const h2 = state();
  H('skip', { ms: 13 * HOUR });
  const dead = await until((st) => !st.pet.alive && st.scene.petAnim === 'dead', 15);
  await sleep(1500);
  snap(`${species}-dead`);
  check(species, 'neglect', h1 && label(h1.hunger) === 'hungry' && h2 && label(h2.hunger) === 'starving' && h2.pet.alive && dead,
    `${h1 ? label(h1.hunger) : '?'} (drawn ${hungry.seen.join(', ')}), then ${h2 ? label(h2.hunger) : '?'}, then ${dead ? 'dead, drawn dead' : 'NOT dead'}`);

  // ---- new pet
  s = await adopt(species);
  check(species, 'new pet', s && s.pet.alive && s.pet.species === species && s.scene.petAnim !== 'dead', s ? `${s.pet.name} came up alive, drawn ${s.scene.petAnim}` : 'no answer');
  if (!s) return;

  // ---- the holiday feeder
  H('setPantry', { n: 300 });
  const m0 = state()?.pet.meals ?? 0;
  H('skip', { ms: 60 * HOUR });
  await sleep(2000);
  s = state();
  check(species, 'feeder', s && s.pet.alive && s.pet.meals >= m0 + 3, s ? `two and a half days away with a full feeder: alive, ${s.pet.meals - m0} meals eaten from it, hunger ${round(s.hunger)}` : 'no answer');

  // ---- size
  const sizes = [];
  for (const steps of [6, 24, 12]) {
    const r = H('scale', { steps }, 20);
    await sleep(900);
    const g = state()?.geometry;
    sizes.push(`${r?.scale ?? '?'}/8: ${g?.width ?? g?.w ?? '?'}x${g?.height ?? g?.h ?? '?'}`);
  }
  s = state();
  check(species, 'size', s && s.settings.scale === 12 && new Set(sizes).size === 3, sizes.join(', '));

  // ---- hide / show
  const hid = H('hide');
  await sleep(600);
  const shown = H('show');
  check(species, 'hide / show', hid?.hidden === true && shown?.hidden === false, `hidden ${hid?.hidden}, then ${shown?.hidden}`);

  if (species === 'frog') {
    H('hour', { value: 23 });
    await sleep(9000);
    s = state();
    snap('frog-night');
    check(species, 'night', s && s.scene.petAnim === 'sleep' && (s.scene.ambient?.fireflies ?? 0) >= 3, s ? `asleep (${s.scene.petAnim}), ${s.scene.ambient?.fireflies} fireflies out` : 'no answer');
    H('hour', { value: 12 });
  }
  if (species === 'chicken') await chickenLife();
}

async function chickenLife() {
  // A new chick, kept fed for eight days: a full feeder each day.
  let s = await adopt('chicken');
  H('hour', { value: 12 });
  let moved = null;
  for (let day = 1; day <= 8 && !moved; day += 1) {
    H('setPantry', { n: 300 }, 20);
    H('skip', { ms: 24 * HOUR }, 20);
    await sleep(1200);
    const st = await until((x) => x.pet.species === 'chicken', 30);
    if (st?.pet.habitat === 'coop') moved = { day, st };
  }
  s = moved ? await until((x) => x.pet.habitat === 'coop' && x.scene.hasView, 30) : state();
  check('chicken', 'grows up', moved && s && s.pet.alive, moved ? `moved from the brooder to the coop after day ${moved.day} (seven days old), alive, drawn ${s?.scene.petAnim}` : `still in the ${s?.pet.habitat} after eight fed days`);
  if (!moved) return;
  snap('chicken-coop');

  // Three more fed days: an egg at the end of each.
  for (let day = 0; day < 3; day += 1) {
    H('setPantry', { n: 300 }, 20);
    H('skip', { ms: 24 * HOUR }, 20);
    await sleep(1200);
  }
  await sleep(2500);
  s = state();
  const eggs = s?.pet.speciesData?.eggs ?? 0;
  snap('chicken-eggs');
  check('chicken', 'eggs', eggs >= 3 && s.scene.ambient?.eggs === Math.min(7, eggs), `${eggs} eggs laid, ${s?.scene.ambient?.eggs} shown in the nest`);

  // A day unfed to zero: no egg for it.
  H('setPantry', { n: 0 });
  H('setHunger', { n: 2 });
  H('skip', { ms: 6 * HOUR });
  H('setPantry', { n: 300 });
  H('skip', { ms: 19 * HOUR });
  await sleep(2000);
  s = state();
  const after = s?.pet.speciesData?.eggs ?? 0;
  check('chicken', 'no egg unfed', s && s.pet.alive && after === eggs, `a day in which it ran out of food: eggs ${eggs} to ${after}`);

  // Night: she roosts in the doorway and it glows.
  H('setHunger', { n: 90 });
  H('hour', { value: 23 });
  const roost = await until((x) => x.scene.petAnim === 'sleep' && x.scene.petAct === 'roost', 60);
  await sleep(6000);
  s = state();
  snap('chicken-roost');
  check('chicken', 'roost', roost && (s?.scene.ambient?.door ?? 0) > 0.3, roost ? `asleep in the doorway (x ${round(s.scene.petPos.x)}), doorway glow ${s.scene.ambient?.door}` : `not roosting: ${s?.scene.petAnim}/${s?.scene.petAct}`);
  H('hour', { value: 12 });

  // Quit and reopen: the same hen, in the coop, with her eggs.
  const id = s?.pet.id;
  await sleep(1200);
  await quit();
  const back = await launch();
  check('chicken', 'relaunch', back && back.pet.id === id && back.pet.habitat === 'coop' && (back.pet.speciesData?.eggs ?? 0) === after,
    back ? `${back.pet.name} ${back.pet.id} came back in the ${back.pet.habitat} with ${back.pet.speciesData?.eggs} eggs` : 'no answer after relaunch');
}

// ---- run
const boot = await launch();
if (!boot) {
  console.error('the harness app did not answer');
  process.exit(1);
}
let build = '?';
// The app rewrites its boot report a moment after it first answers; read it once it has.
await sleep(4000);
try {
  const doc = JSON.parse(readFileSync(join(HAD, 'boot-report.json'), 'utf8'));
  const b = (doc.doc ?? doc).build ?? {};
  build = `${b.bundle ?? '?'} built ${b.builtAt ?? '?'}`;
} catch {
  /* reported as unknown */
}
console.log(`[${stamp()}] harness app: ${build}`);
const scaleBefore = boot.settings.scale;
for (const species of which) await walk(species);
// Leave it as it was found: the clock and the light following the real ones, the size back, and a
// pet born now (the walk's pets lived on a clock days ahead of the real one).
H('hour', { value: null });
H('resetClock');
H('newPet', { species: 'fish' }, 20);
await until((s) => s.pet.species === 'fish' && s.pet.alive, 45);
H('scale', { steps: scaleBefore }, 20);
await sleep(1500);
await quit();

const passed = results.filter((r) => r.pass).length;
writeFileSync(join(OUT, 'walk.json'), JSON.stringify({ at: new Date().toISOString(), build, results }, null, 1) + '\n');
const rows = results.map((r) => `| ${r.species} | ${r.name} | ${r.pass ? 'pass' : '**FAIL**'} | ${r.detail} |`);
writeFileSync(join(OUT, 'walk.md'), `Acceptance walk, installed harness app (${build}).\n${passed} of ${results.length} checks pass.\n\n| pet | check | result | what was seen |\n|---|---|---|---|\n${rows.join('\n')}\n`);
console.log(`[${stamp()}] ${passed} of ${results.length} checks pass`);
process.exit(passed === results.length ? 0 : 1);
