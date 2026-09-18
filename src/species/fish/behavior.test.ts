import { describe, expect, it } from 'vitest';
import { createFishBehavior } from './behavior';
import { BOWL_WATER_SHAPE, FISH_BODY } from './layout';
import { makeWaterBounds } from '../../render/water';
import type { FishInput, FishOutput } from '../../render/types';
import type { HungerLabel, Rng } from '../../sim/types';

const bounds = makeWaterBounds(BOWL_WATER_SHAPE);
// One source of truth with the manifest; a stale copy here silently tests a fish that is not shipped.
const body = FISH_BODY;
const HW = body.w / 2;
const HH = body.h / 2;

/** Deterministic mulberry32 rng. */
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

function input(over: Partial<FishInput> = {}, rng: Rng = seeded(1)): FishInput {
  return {
    hunger: 80,
    label: 'full',
    alive: true,
    asleep: false,
    flakes: [],
    bounds,
    body,
    rng,
    ...over,
  };
}

function boxInside(o: FishOutput): boolean {
  return (
    bounds.inside(o.x - HW, o.y - HH) &&
    bounds.inside(o.x + HW, o.y - HH) &&
    bounds.inside(o.x - HW, o.y + HH) &&
    bounds.inside(o.x + HW, o.y + HH)
  );
}

function run(ticks: number, make: (i: number) => FishInput): FishOutput[] {
  const b = createFishBehavior();
  const outs: FishOutput[] = [];
  for (let i = 0; i < ticks; i += 1) outs.push(b.step(make(i)));
  return outs;
}

describe('fish behavior', () => {
  it('stays inside the water for 5000 ticks across hunger states with a seeded rng', () => {
    const rng = seeded(42);
    const labels: HungerLabel[] = ['full', 'peckish', 'hungry', 'starving'];
    const outs = run(5000, (i) => {
      const label = labels[Math.floor(i / 1000) % labels.length] ?? 'full';
      const asleep = i >= 4000;
      return input({ label, asleep }, rng);
    });
    for (const o of outs) {
      expect(Number.isInteger(o.x)).toBe(true);
      expect(Number.isInteger(o.y)).toBe(true);
      expect(boxInside(o)).toBe(true);
    }
  });

  it('actually moves around while content', () => {
    const outs = run(600, () => input({}, seeded(7)));
    const xs = new Set(outs.map((o) => o.x));
    const ys = new Set(outs.map((o) => o.y));
    expect(xs.size).toBeGreaterThan(40);
    expect(ys.size).toBeGreaterThan(20);
    expect(outs.every((o) => o.anim === 'idle')).toBe(true);
  });

  it('bites a flake placed within range and reports eat for a few ticks', () => {
    const b = createFishBehavior();
    const first = b.step(input());
    const flake = { x: first.x + 8, y: first.y - 6 };
    const o = b.step(input({ flakes: [flake] }));
    expect(o.biteFlakeIndex).toBe(0);
    expect(o.anim).toBe('eat');
    const after = b.step(input());
    expect(after.biteFlakeIndex).toBeNull();
    expect(after.anim).toBe('eat');
  });

  it('darts to a far flake and eats it within a few seconds', () => {
    const b = createFishBehavior();
    const first = b.step(input());
    const flakes = [{ x: bounds.rect.x + 60, y: bounds.surfaceY + 8 }, { x: first.x, y: bounds.floorY - 10 }];
    let bitten: number | null = null;
    let ticks = 0;
    while (bitten === null && ticks < 80) {
      const o = b.step(input({ flakes }));
      bitten = o.biteFlakeIndex;
      ticks += 1;
      expect(boxInside(o)).toBe(true);
    }
    expect(bitten).not.toBeNull();
    expect(ticks).toBeLessThan(80);
  });

  it('eats the nearest flake first', () => {
    const b = createFishBehavior();
    const first = b.step(input());
    const flakes = [
      { x: first.x + 80, y: first.y },
      { x: first.x + 10, y: first.y },
    ];
    const o = b.step(input({ flakes }));
    expect(o.biteFlakeIndex).toBe(1);
  });

  it('dead: floats belly-up as high as the body still fits, and never bites', () => {
    const b = createFishBehavior();
    for (let i = 0; i < 20; i += 1) b.step(input());
    // The highest legal centre for the body box, which is what "at the surface" has to mean: the
    // water's topmost row is the glass, so a raw surfaceY + 12 hangs the dorsal fin outside the bowl.
    const expected = bounds.clamp(160, bounds.surfaceY + 12, body.w / 2, body.h / 2);
    for (let i = 0; i < 50; i += 1) {
      const o = b.step(input({ alive: false, flakes: [{ x: 162, y: 60 }] }));
      expect(o.y).toBe(Math.round(expected.y));
      expect(o.anim).toBe('dead');
      expect(o.turning).toBe(false);
      expect(o.biteFlakeIndex).toBeNull();
      // Every corner of the body box, not just its centre — the centre can sit inside the ellipse
      // while the fins hang through the glass, which is exactly the bug this guards.
      for (const dx of [-body.w / 2, body.w / 2]) {
        for (const dy of [-body.h / 2, body.h / 2]) {
          expect(bounds.inside(o.x + dx, o.y + dy), `body corner (${dx}, ${dy}) must stay inside the water`).toBe(true);
        }
      }
    }
  });

  it('can reach a flake that has settled on the gravel', () => {
    // Regression: the water clamp keeps the body box inside the bowl, so the body CENTRE cannot get
    // near the gravel. Flakes settle a few px above floorY. Measuring bite distance from the centre
    // put settled food ~19px away with a 12px bite range, so the fish hovered over its dinner until
    // the flake dissolved 30s later, and nothing in the suite noticed.
    const b = createFishBehavior();
    b.step(input());
    const settled = { x: 160, y: bounds.floorY - 4 };
    let bitten: number | null = null;
    let ticks = 0;
    while (bitten === null && ticks < 200) {
      const o = b.step(input({ flakes: [settled] }));
      bitten = o.biteFlakeIndex;
      expect(boxInside(o), 'the body must stay inside the water while chasing food').toBe(true);
      ticks += 1;
    }
    expect(bitten, 'a flake resting on the gravel must be eatable').toBe(0);
  });

  it('turning is true exactly once per facing change, on the change tick', () => {
    const rng = seeded(99);
    const outs = run(3000, (i) => input({ label: i % 2 === 0 ? 'full' : 'peckish' }, rng));
    let changes = 0;
    let turns = 0;
    for (let i = 1; i < outs.length; i += 1) {
      const prev = outs[i - 1];
      const cur = outs[i];
      if (prev === undefined || cur === undefined) continue;
      if (cur.facing !== prev.facing) {
        changes += 1;
        expect(cur.turning).toBe(true);
      } else {
        expect(cur.turning).toBe(false);
      }
      if (cur.turning) turns += 1;
    }
    expect(changes).toBeGreaterThan(2);
    expect(turns).toBe(changes);
  });

  it('hungry: hangs in the top third with the hungry anim', () => {
    const outs = run(800, () => input({ label: 'hungry', hunger: 20 }, seeded(3)));
    const settled = outs.slice(200);
    const limit = bounds.surfaceY + (bounds.floorY - bounds.surfaceY) / 3 + HH + 4;
    for (const o of settled) {
      expect(o.y).toBeLessThanOrEqual(limit);
      expect(o.anim).toBe('hungry');
      expect(boxInside(o)).toBe(true);
    }
  });

  it('starving: rests near the floor and barely moves', () => {
    const outs = run(600, () => input({ label: 'starving', hunger: 0 }, seeded(5)));
    const settled = outs.slice(300);
    const ys = new Set(settled.map((o) => o.y));
    expect(ys.size).toBeLessThanOrEqual(2);
    const last = settled[settled.length - 1];
    expect(last).toBeDefined();
    if (last) expect(last.y).toBeGreaterThan(bounds.floorY - HH - 12);
    const xs = settled.map((o) => o.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(24);
  });

  it('asleep: still near the floor with the sleep anim', () => {
    const outs = run(400, () => input({ asleep: true }, seeded(11)));
    const settled = outs.slice(200);
    const first = settled[0];
    expect(first).toBeDefined();
    for (const o of settled) {
      expect(o.anim).toBe('sleep');
      if (first) {
        expect(o.x).toBe(first.x);
        expect(o.y).toBe(first.y);
      }
      expect(o.y).toBeGreaterThan(bounds.floorY - HH - 12);
    }
  });

  it('reset() restarts from the bowl center', () => {
    const b = createFishBehavior();
    for (let i = 0; i < 300; i += 1) b.step(input({}, seeded(8)));
    b.reset();
    const o = b.step(input());
    // Derived, not hardcoded: the centre of the water band, which moved when surfaceY stopped meaning
    // the top of the glass. A literal here is what went stale the first time.
    const waterCentreY = (bounds.surfaceY + bounds.floorY) / 2;
    expect(Math.abs(o.x - 162)).toBeLessThanOrEqual(4);
    expect(Math.abs(o.y - waterCentreY)).toBeLessThanOrEqual(6);
  });
});
