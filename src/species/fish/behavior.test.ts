import { describe, expect, it } from 'vitest';
import { createFishBehavior } from './behavior';
import { BOWL_WATER_SHAPE } from './layout';
import { makeWaterBounds } from '../../render/water';
import type { FishInput, FishOutput } from '../../render/types';
import type { HungerLabel, Rng } from '../../sim/types';

const bounds = makeWaterBounds(BOWL_WATER_SHAPE);
const body = { w: 28, h: 14 };
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
    expect(xs.size).toBeGreaterThan(20);
    expect(ys.size).toBeGreaterThan(10);
    expect(outs.every((o) => o.anim === 'idle')).toBe(true);
  });

  it('bites a flake placed within range and reports eat for a few ticks', () => {
    const b = createFishBehavior();
    const first = b.step(input());
    const flake = { x: first.x + 4, y: first.y - 3 };
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
    const flakes = [{ x: bounds.rect.x + 30, y: bounds.surfaceY + 4 }, { x: first.x, y: bounds.floorY - 5 }];
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
      { x: first.x + 40, y: first.y },
      { x: first.x + 5, y: first.y },
    ];
    const o = b.step(input({ flakes }));
    expect(o.biteFlakeIndex).toBe(1);
  });

  it('dead: floats belly-up at surfaceY + 6 with the dead anim and never bites', () => {
    const b = createFishBehavior();
    for (let i = 0; i < 20; i += 1) b.step(input());
    for (let i = 0; i < 50; i += 1) {
      const o = b.step(input({ alive: false, flakes: [{ x: 81, y: 30 }] }));
      expect(o.y).toBe(bounds.surfaceY + 6);
      expect(o.anim).toBe('dead');
      expect(o.turning).toBe(false);
      expect(o.biteFlakeIndex).toBeNull();
      expect(bounds.inside(o.x, o.y)).toBe(true);
    }
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
    const limit = bounds.surfaceY + (bounds.floorY - bounds.surfaceY) / 3 + HH + 2;
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
    if (last) expect(last.y).toBeGreaterThan(bounds.floorY - HH - 6);
    const xs = settled.map((o) => o.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(12);
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
      expect(o.y).toBeGreaterThan(bounds.floorY - HH - 6);
    }
  });

  it('reset() restarts from the bowl center', () => {
    const b = createFishBehavior();
    for (let i = 0; i < 300; i += 1) b.step(input({}, seeded(8)));
    b.reset();
    const o = b.step(input());
    expect(Math.abs(o.x - 81)).toBeLessThanOrEqual(2);
    expect(Math.abs(o.y - 60)).toBeLessThanOrEqual(3);
  });
});
