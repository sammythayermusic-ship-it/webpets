import { describe, expect, it } from 'vitest';
import { createFishBehavior } from './behavior';
import { BOWL_WATER_SHAPE, FISH_BODY } from './layout';
import { makeWaterBounds } from '../../render/water';
import type { FishInput, FishOutput } from '../../render/types';
import type { Drives } from '../../sim/needs';
import type { Personality, Rng } from '../../sim/types';

const bounds = makeWaterBounds(BOWL_WATER_SHAPE);
const body = FISH_BODY;
const HH = body.h / 2;

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

function input(over: Partial<FishInput> = {}, rng: Rng): FishInput {
  return {
    hunger: 80,
    label: 'full',
    alive: true,
    asleep: false,
    flakes: [],
    bounds,
    body,
    pantryFraction: 0,
    attract: null,
    rng,
    drives: calm,
    personality: 'zen',
    ...over,
  };
}

/** Run `ticks` steps with one persistent rng; `make` may vary the input per tick. */
function run(ticks: number, make: (i: number) => Partial<FishInput>, seed = 7): FishOutput[] {
  const b = createFishBehavior();
  const rng = seeded(seed);
  const outs: FishOutput[] = [];
  for (let i = 0; i < ticks; i += 1) outs.push(b.step(input(make(i), rng)));
  return outs;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const travelled = (outs: FishOutput[]): number => outs.reduce((s, o, i) => (i === 0 ? 0 : s + dist(o, outs[i - 1]!)), 0);

describe('drives', () => {
  it('naps on the gravel in daylight when the drives say so, and wakes when they stop', () => {
    const outs = run(400, (i) => ({ drives: { ...calm, nap: i < 250 } }));
    const napping = outs.slice(60, 250);
    for (const o of napping) {
      expect(o.anim).toBe('sleep');
      expect(o.y).toBeGreaterThan(bounds.floorY - HH - 12);
    }
    const awake = outs.slice(300);
    expect(awake.some((o) => o.anim === 'idle')).toBe(true);
    expect(travelled(awake)).toBeGreaterThan(20);
  });

  it('a hiding fish keeps to the plant side and the floor', () => {
    const open = run(800, () => ({ drives: { ...calm, hide: 0 } }));
    const hiding = run(800, () => ({ drives: { ...calm, hide: 1 } }));
    const meanX = (os: FishOutput[]): number => os.reduce((s, o) => s + o.x, 0) / os.length;
    const meanY = (os: FishOutput[]): number => os.reduce((s, o) => s + o.y, 0) / os.length;
    expect(meanX(hiding.slice(200))).toBeGreaterThan(meanX(open.slice(200)) + 10);
    expect(meanY(hiding.slice(200))).toBeGreaterThan(meanY(open.slice(200)) + 5);
  });

  it('greets: darts to the glass where the pointer is, once', () => {
    const at = { x: bounds.rect.x + 20, y: bounds.surfaceY + 30, strength: 0.6 };
    const greeting = run(30, () => ({ attract: at, drives: { ...calm, greet: true } }));
    const ignoring = run(30, () => ({ attract: at, drives: { ...calm, greet: false } }));
    const closest = (os: FishOutput[]): number => Math.min(...os.map((o) => dist(o, at)));
    expect(closest(greeting)).toBeLessThan(closest(ignoring) - 10);
    // A dart: at least one step well above cruise speed in the first second.
    const steps = greeting.slice(1, 9).map((o, i) => dist(o, greeting[i]!));
    expect(Math.max(...steps)).toBeGreaterThan(3.5);
  });

  it('startles away from a tap on the glass', () => {
    const b = createFishBehavior();
    const rng = seeded(3);
    let o = b.step(input({}, rng));
    for (let i = 0; i < 40; i += 1) o = b.step(input({}, rng));
    const before = o;
    const tap = { x: before.x + 6, y: before.y };
    const after: FishOutput[] = [b.step(input({ tap }, rng))];
    for (let i = 0; i < 6; i += 1) after.push(b.step(input({}, rng)));
    const last = after[after.length - 1]!;
    expect(last.x).toBeLessThan(before.x - 8); // away from the tap, which was to its right
    const burst = after.slice(1).map((p, i) => dist(p, after[i]!));
    expect(Math.max(...burst)).toBeGreaterThan(3);
  });

  it('visits the surface and gapes when the surface drive is high', () => {
    const outs = run(2400, () => ({ drives: { ...calm, surface: 1 } }), 5);
    const top = bounds.surfaceY + HH + 6;
    expect(outs.some((o) => o.y <= top)).toBe(true);
    expect(outs.some((o) => o.anim === 'eat')).toBe(true);
    const none = run(2400, () => ({ drives: { ...calm, surface: 0 } }), 5);
    expect(none.some((o) => o.anim === 'eat')).toBe(false);
  });

  it('activity sets the pace and the range', () => {
    const lively = run(600, () => ({ drives: { ...calm, activity: 1 } }));
    const tired = run(600, () => ({ drives: { ...calm, activity: 0.1 } }));
    expect(travelled(lively)).toBeGreaterThan(travelled(tired) * 1.6);
  });

  it('personality shows in the swimming: a degen covers more water than a zen fish', () => {
    const by = (p: Personality): number => travelled(run(900, () => ({ personality: p }), 11));
    expect(by('degen')).toBeGreaterThan(by('zen') * 1.25);
  });

  it('does not loop: no lag of the path repeats itself', () => {
    const outs = run(1600, () => ({}), 13).slice(100);
    let best = Infinity;
    for (let lag = 60; lag <= 700; lag += 7) {
      let s = 0;
      let n = 0;
      for (let i = 0; i + lag < outs.length; i += 5) {
        s += dist(outs[i]!, outs[i + lag]!);
        n += 1;
      }
      best = Math.min(best, s / n);
    }
    expect(best).toBeGreaterThan(6);
  });

  it('with no drives supplied it behaves like a rested, settled fish', () => {
    const b = createFishBehavior();
    const rng = seeded(7);
    const outs: FishOutput[] = [];
    for (let i = 0; i < 300; i += 1) {
      const { drives: _omit, ...rest } = input({}, rng);
      outs.push(b.step(rest));
    }
    expect(outs.every((o) => o.anim === 'idle')).toBe(true);
    expect(travelled(outs)).toBeGreaterThan(100);
  });
});
