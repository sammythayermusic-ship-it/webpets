import { describe, expect, it } from 'vitest';
import { BUG_ESCAPE_TICKS, createChickenBehavior, type ChickenStage } from './behavior';
import {
  BROODER_FLOOR_RECT, BROODER_FOOD_ROW, BROODER_SITES, BROODER_STAND_Y, CHICK_BODY,
  COOP_FLOOR_RECT, COOP_FOOD_ROW, COOP_SITES, COOP_STAND_Y, HEN_BODY, siteX,
} from './layout';
import { makeFloorBounds } from '../../render/water';
import type { PetInput, PetOutput } from '../../render/types';
import type { HungerLabel, Rng } from '../../sim/types';

const WORLDS = {
  chick: { stage: 'chick' as ChickenStage, bounds: makeFloorBounds({ rect: BROODER_FLOOR_RECT, standY: BROODER_STAND_Y }), body: CHICK_BODY, sites: BROODER_SITES, foodRow: BROODER_FOOD_ROW, bed: 'lamp' },
  hen: { stage: 'hen' as ChickenStage, bounds: makeFloorBounds({ rect: COOP_FLOOR_RECT, standY: COOP_STAND_Y }), body: HEN_BODY, sites: COOP_SITES, foodRow: COOP_FOOD_ROW, bed: 'door' },
} as const;
type World = (typeof WORLDS)[keyof typeof WORLDS];

function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function input(w: World, over: Partial<PetInput> = {}, rng: Rng = seeded(1)): PetInput {
  return { hunger: 100, label: 'full', alive: true, asleep: false, flakes: [], bounds: w.bounds, body: w.body, pantryFraction: 0, attract: null, rng, ...over };
}

function run(w: World, ticks: number, make: (i: number) => Partial<PetInput>, rng: Rng = seeded(1)): PetOutput[] {
  const b = createChickenBehavior(w.stage, w.sites);
  const outs: PetOutput[] = [];
  for (let i = 0; i < ticks; i += 1) outs.push(b.step(input(w, make(i), rng)));
  return outs;
}

const boxInside = (w: World, o: PetOutput): boolean => w.bounds.inside(o.x - w.body.w / 2, o.y) && w.bounds.inside(o.x + w.body.w / 2, o.y);

const LABELS: HungerLabel[] = ['full', 'peckish', 'hungry', 'starving'];

describe.each(Object.values(WORLDS))('chicken: the $stage', (w) => {
  it('keeps its body box on the floor in every state, over a long day', () => {
    for (const label of LABELS) {
      for (const asleep of [false, true]) {
        const rng = seeded(label.length * 7 + (asleep ? 1 : 0));
        const outs = run(w, 3000, (i) => ({ label, hunger: label === 'full' ? 100 : 20, asleep, ...(i % 400 === 399 ? { tap: { x: 160, y: 100 } } : {}) }), rng);
        for (const o of outs) expect(boxInside(w, o)).toBe(true);
      }
    }
  });

  it('can stand at every one of its sites', () => {
    for (const r of Object.values(w.sites)) {
      const c = w.bounds.clamp(siteX(r), w.bounds.floorY, w.body.w / 2, w.body.h / 2);
      expect(Math.abs(c.x - siteX(r))).toBeLessThan(0.001);
    }
  });

  it('only plays its walk when it actually covered ground', () => {
    const outs = run(w, 4000, () => ({}), seeded(9));
    for (let i = 1; i < outs.length; i += 1) {
      if (outs[i]!.anim === 'walk') expect(Math.abs(outs[i]!.x - outs[i - 1]!.x)).toBeGreaterThan(0.1);
    }
    expect(outs.some((o) => o.anim === 'walk')).toBe(true);
    expect(outs.some((o) => o.anim === 'eat')).toBe(true);
  });

  it('walks to dropped feed and eats it', () => {
    const b = createChickenBehavior(w.stage, w.sites);
    const rng = seeded(3);
    const food = { x: w.bounds.rect.x + w.bounds.rect.w - 30, y: Math.round(w.foodRow) };
    let ate = -1;
    for (let i = 0; i < 200 && ate < 0; i += 1) {
      const o = b.step(input(w, { flakes: [food] }, rng));
      if (o.biteFlakeIndex === 0) ate = i;
    }
    expect(ate).toBeGreaterThan(5);
    const after = b.step(input(w, {}, rng));
    expect(after.anim).toBe('eat');
  });

  it('goes to bed at night and sleeps there', () => {
    const outs = run(w, 300, () => ({ asleep: true }));
    const last = outs[outs.length - 1]!;
    expect(last.anim).toBe('sleep');
    expect(Math.abs(last.x - siteX(w.sites[w.bed]!))).toBeLessThanOrEqual(2);
    // it walks there awake: asleep only once it has arrived
    for (const o of outs) if (o.anim === 'sleep') expect(Math.abs(o.x - siteX(w.sites[w.bed]!))).toBeLessThanOrEqual(2);
    if (w.stage === 'hen') expect(last.act).toBe('roost');
    else expect(last.act).toBeUndefined();
  });

  it('stands at the feeder when hungry, and does not travel when starving', () => {
    const hungry = run(w, 300, () => ({ label: 'hungry', hunger: 20 }));
    const last = hungry[hungry.length - 1]!;
    expect(last.anim).toBe('hungry');
    expect(Math.abs(last.x - siteX(w.sites['feeder']!))).toBeLessThanOrEqual(2);
    const starving = run(w, 100, () => ({ label: 'starving', hunger: 0 }));
    for (const o of starving) {
      expect(o.anim).toBe('hungry');
      expect(o.x).toBe(starving[0]!.x);
    }
  });

  it('runs from a tap on the glass', () => {
    const outs = run(w, 14, (i) => (i === 1 ? { tap: { x: 0, y: 100 } } : {}), () => 0.99);
    // away from the tap, at once, and well clear of where it stood by the time it settles
    expect(outs[2]!.x).toBeGreaterThan(outs[1]!.x);
    expect(outs[13]!.x - outs[1]!.x).toBeGreaterThan(12);
  });

  it('lies dead where it fell', () => {
    const outs = run(w, 50, (i) => ({ alive: i < 20 }));
    for (const o of outs.slice(20)) {
      expect(o.anim).toBe('dead');
      expect(o.x).toBe(outs[20]!.x);
    }
  });
});

describe('chicken: what each bird does', () => {
  it('the chick naps under the lamp and drinks; it never scratches, bathes or chases', () => {
    const outs = run(WORLDS.chick, 30000, () => ({}), seeded(21));
    const acts = new Set(outs.map((o) => o.act).filter((a) => a !== undefined));
    expect(acts.has('drink')).toBe(true);
    for (const a of ['scratch', 'dustbathe', 'chase', 'roost'] as const) expect(acts.has(a)).toBe(false);
    expect(outs.every((o) => o.bug === undefined)).toBe(true);
    const naps = outs.filter((o) => o.anim === 'sleep');
    expect(naps.length).toBeGreaterThan(100);
    for (const o of naps) expect(Math.abs(o.x - siteX(BROODER_SITES['lamp']!))).toBeLessThanOrEqual(2);
  });

  it('the hen scratches, takes dust baths in the hollow, and chases bugs', () => {
    const outs = run(WORLDS.hen, 30000, () => ({}), seeded(22));
    const acts = new Set(outs.map((o) => o.act).filter((a) => a !== undefined));
    for (const a of ['scratch', 'dustbathe', 'chase'] as const) expect(acts.has(a)).toBe(true);
    for (const o of outs) if (o.act === 'dustbathe') expect(Math.abs(o.x - siteX(COOP_SITES['dust']!))).toBeLessThanOrEqual(2);
  });

  it('a chase always ends: she catches the bug, or it gets away, within its time', () => {
    const outs = run(WORLDS.hen, 60000, () => ({}), seeded(23));
    let chases = 0;
    let caught = 0;
    let len = 0;
    for (let i = 0; i < outs.length; i += 1) {
      const o = outs[i]!;
      if (o.bug !== undefined) {
        len += 1;
        expect(len).toBeLessThanOrEqual(BUG_ESCAPE_TICKS + 1);
        // the bug stays in the run, on the ground at her feet
        expect(o.bug.x).toBeGreaterThanOrEqual(COOP_FLOOR_RECT.x);
        expect(o.bug.x).toBeLessThanOrEqual(COOP_FLOOR_RECT.x + COOP_FLOOR_RECT.w);
        expect(o.bug.y).toBe(COOP_STAND_Y + HEN_BODY.h / 2);
      } else if (len > 0) {
        chases += 1;
        if (o.anim === 'eat') caught += 1;
        len = 0;
      }
    }
    expect(chases).toBeGreaterThan(5);
    // mostly she gets it
    expect(caught / chases).toBeGreaterThan(0.6);
  });

  it('feed on the floor ends a chase at once', () => {
    const w = WORLDS.hen;
    const b = createChickenBehavior('hen', COOP_SITES);
    const rng = seeded(23);
    let i = 0;
    let o = b.step(input(w, {}, rng));
    while (o.bug === undefined && i < 60000) {
      o = b.step(input(w, {}, rng));
      i += 1;
    }
    expect(o.bug).toBeDefined();
    const fed = b.step(input(w, { flakes: [{ x: 100, y: COOP_FOOD_ROW }] }, rng));
    expect(fed.bug).toBeUndefined();
    expect(fed.act).toBeUndefined();
  });
});
