import { describe, expect, it } from 'vitest';
import { createHamsterBehavior } from './behavior';
import { CAGE_SITES, siteX } from './layout';
import { TERR_SITES } from './terrarium';
import type { Sites } from '../types';
import { makeFloorBounds } from '../../render/water';
import type { PetInput, PetOutput } from '../../render/types';
import type { Drives } from '../../sim/needs';
import type { Rng } from '../../sim/types';

const bounds = makeFloorBounds({ rect: { x: 40, y: 150, w: 240, h: 40 }, standY: 185 });
const body = { w: 40, h: 30 };

function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const calm: Drives = { activity: 0.65, approach: 1, hide: 0, nap: false, greet: false, surface: 0 };

function input(over: Partial<PetInput>, rng: Rng): PetInput {
  return {
    hunger: 80,
    label: 'full',
    alive: true,
    asleep: false,
    flakes: [],
    bounds,
    body,
    pantryFraction: 0.5,
    attract: null,
    rng,
    drives: calm,
    personality: 'zen',
    ...over,
  };
}

function run(ticks: number, make: (i: number) => Partial<PetInput>, seed = 7, sites?: Sites): PetOutput[] {
  const b = createHamsterBehavior(sites);
  const rng = seeded(seed);
  const outs: PetOutput[] = [];
  for (let i = 0; i < ticks; i += 1) outs.push(b.step(input(make(i), rng)));
  return outs;
}

const travelled = (outs: PetOutput[]): number => outs.reduce((s, o, i) => (i === 0 ? 0 : s + Math.abs(o.x - outs[i - 1]!.x)), 0);

describe('hamster drives', () => {
  it('naps in the bedding pile in daylight when worn out', () => {
    const outs = run(300, () => ({ drives: { ...calm, nap: true } }));
    const bed = siteX(CAGE_SITES.bed!);
    const settled = outs.slice(150);
    for (const o of settled) {
      expect(o.anim).toBe('sleep');
      expect(Math.abs(o.x - bed)).toBeLessThanOrEqual(3);
    }
  });

  it('hides: keeps to the bedding pile and runs no errands', () => {
    const bed = siteX(CAGE_SITES.bed!);
    const hiding = run(1200, () => ({ drives: { ...calm, hide: 1 } }));
    const open = run(1200, () => ({ drives: { ...calm, hide: 0 } }));
    const meanDist = (os: PetOutput[]): number => os.reduce((s, o) => s + Math.abs(o.x - bed), 0) / os.length;
    expect(meanDist(hiding.slice(200))).toBeLessThan(meanDist(open.slice(200)) * 0.6);
    expect(hiding.every((o) => o.anim !== 'eat')).toBe(true);
  });

  it('greets: dashes to the bars where the pointer is, once', () => {
    const at = { x: bounds.rect.x + 30, y: 170, strength: 0.6 };
    const greeting = run(40, () => ({ attract: at, drives: { ...calm, greet: true } }));
    const closest = Math.min(...greeting.map((o) => Math.abs(o.x - at.x)));
    expect(closest).toBeLessThanOrEqual(body.w / 2 + 3);
    const steps = greeting.slice(1, 20).map((o, i) => Math.abs(o.x - greeting[i]!.x));
    expect(Math.max(...steps)).toBeGreaterThan(2.5);
  });

  it('startles away from a tap and then stops to collect itself', () => {
    const b = createHamsterBehavior();
    const rng = seeded(5);
    let o = b.step(input({}, rng));
    for (let i = 0; i < 30; i += 1) o = b.step(input({}, rng));
    const before = o;
    const tap = { x: before.x - 5, y: 180 };
    const after: PetOutput[] = [b.step(input({ tap }, rng))];
    for (let i = 0; i < 14; i += 1) after.push(b.step(input({}, rng)));
    expect(after[6]!.x).toBeGreaterThan(before.x + 8); // away from the tap, which was to its left
    const steps = after.slice(1, 8).map((p, i) => Math.abs(p.x - after[i]!.x));
    expect(Math.max(...steps)).toBeGreaterThan(3);
    // then it stops
    const tail = after.slice(12);
    expect(tail.every((p) => Math.abs(p.x - tail[0]!.x) < 0.5)).toBe(true);
  });

  it('grooms now and then where it stands', () => {
    const outs = run(4000, () => ({ pantryFraction: 0 }), 9);
    // With the hopper empty and the wheel allowed, an `eat` anim at no site is a groom (or a drink).
    expect(outs.some((o) => o.anim === 'eat')).toBe(true);
  });

  it('activity sets the pace', () => {
    const lively = run(800, () => ({ drives: { ...calm, activity: 1, hide: 0 } }), 3);
    const tired = run(800, () => ({ drives: { ...calm, activity: 0.1, hide: 0 } }), 3);
    expect(travelled(lively)).toBeGreaterThan(travelled(tired) * 1.4);
  });

  it('a win: wants the wheel more, runs it harder, and sprints it every so often', () => {
    const km = (outs: PetOutput[]): number => outs.reduce((s, o) => s + (o.speciesDelta?.wheelKm ?? 0), 0);
    const happy = run(2400, () => ({ drives: { ...calm, cheer: 1 } }), 13);
    const plain = run(2400, () => ({ drives: calm }), 13);
    expect(km(happy)).toBeGreaterThan(km(plain) * 1.5);
    expect(happy.every((o) => o.act !== 'sulk')).toBe(true);
  });

  it('a loss: keeps to its house, walks slower, and sulks for the art', () => {
    const bed = siteX(CAGE_SITES.bed!);
    const sad = run(1200, () => ({ drives: { ...calm, cheer: -1 } }), 17);
    const plain = run(1200, () => ({ drives: calm }), 17);
    const meanDist = (os: PetOutput[]): number => os.reduce((s, o) => s + Math.abs(o.x - bed), 0) / os.length;
    expect(meanDist(sad.slice(200))).toBeLessThan(meanDist(plain.slice(200)) * 0.6);
    expect(sad.slice(50).every((o) => o.act === 'sulk')).toBe(true);
    expect(plain.every((o) => o.act === undefined)).toBe(true);
    // Hunger outranks a mood: a hungry hamster sits by the hopper, sulk or no sulk.
    const hungry = run(200, () => ({ hunger: 20, label: 'hungry', drives: { ...calm, cheer: -1 } }), 17);
    expect(hungry.every((o) => o.act === undefined)).toBe(true);
  });

  it('in the terrarium, the wheel and the house are where the terrarium put them', () => {
    // The checkpoint G recording caught the cage's sites in the terrarium: victory sprints under the
    // house (the cage's wheel x) and a sulk beside the wheel (the cage's bed x).
    const cageWheel = siteX(CAGE_SITES.wheel!);
    const terrWheel = siteX(TERR_SITES.wheel!);
    const terrBed = siteX(TERR_SITES.bed!);
    expect(Math.abs(cageWheel - terrWheel)).toBeGreaterThan(20); // or this test could not tell
    const happy = run(2400, () => ({ drives: { ...calm, cheer: 1 } }), 13, TERR_SITES);
    const running = happy.filter((o) => (o.speciesDelta?.wheelKm ?? 0) > 0);
    expect(running.length).toBeGreaterThan(0);
    for (const o of running) expect(Math.abs(o.x - terrWheel)).toBeLessThanOrEqual(3);
    const sad = run(1200, () => ({ drives: { ...calm, cheer: -1 } }), 17, TERR_SITES);
    const meanDist = (os: PetOutput[], to: number): number => os.reduce((s, o) => s + Math.abs(o.x - to), 0) / os.length;
    expect(meanDist(sad.slice(200), terrBed)).toBeLessThan(meanDist(sad.slice(200), siteX(CAGE_SITES.bed!)));
  });

  it('a hyper covers more bedding than a zen hamster', () => {
    const by = (p: 'zen' | 'hyper'): number => travelled(run(1200, () => ({ personality: p }), 11));
    expect(by('hyper')).toBeGreaterThan(by('zen') * 1.2);
  });
});
