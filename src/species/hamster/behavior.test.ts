import { describe, expect, it } from 'vitest';
import { createHamsterBehavior, wheelRate } from './behavior';
import { CAGE_FLOOR_RECT, CAGE_SITES, CAGE_STAND_Y, HAMSTER_BODY, siteX } from './layout';
import { makeFloorBounds } from '../../render/water';
import { FLOOR_REST_BELOW } from '../../render/food';
import type { PetInput, PetOutput } from '../../render/types';
import type { HungerLabel, Rng } from '../../sim/types';

const bounds = makeFloorBounds({ rect: CAGE_FLOOR_RECT, standY: CAGE_STAND_Y });

/** Deterministic rng, so a failure is a real failure rather than an unlucky seed. */
function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function input(over: Partial<PetInput> = {}, rng: Rng = seeded(1)): PetInput {
  return {
    hunger: 100,
    label: 'full',
    alive: true,
    asleep: false,
    flakes: [],
    bounds,
    body: HAMSTER_BODY,
    pantryFraction: 0,
    attract: null,
    rng,
    ...over,
  };
}

/** All four corners of the body box inside the walkable span. The headline invariant. */
function boxInside(o: PetOutput): boolean {
  const hw = HAMSTER_BODY.w / 2;
  return bounds.inside(o.x - hw, o.y) && bounds.inside(o.x + hw, o.y);
}

function run(ticks: number, make: (i: number) => PetInput): PetOutput[] {
  const b = createHamsterBehavior();
  const outs: PetOutput[] = [];
  for (let i = 0; i < ticks; i += 1) outs.push(b.step(make(i)));
  return outs;
}

/**
 * The row food actually comes to rest on, from `food.ts` rather than typed in here.
 *
 * These tests used to place flakes at `CAGE_STAND_Y`, which is not where the food system puts them —
 * and they passed anyway, because the hamster measures bite range horizontally and ignores y. A suite
 * and an implementation agreeing about a place neither of them uses is worse than no test: it is why
 * feeding in the cage shipped broken.
 */
const SEED_ROW = CAGE_STAND_Y + FLOOR_REST_BELOW;

const LABELS: HungerLabel[] = ['full', 'peckish', 'hungry', 'starving'];

describe('hamster behavior', () => {
  it('keeps the body box on the bedding for 5000 ticks in every hunger state', () => {
    // The same guarantee the fish's suite leads with, and the reason `MoveBounds` was worth
    // generalising rather than special-casing: the assertion is identical, only the domain differs.
    for (const label of LABELS) {
      const rng = seeded(7);
      const outs = run(5000, () => input({ label, hunger: label === 'starving' ? 0 : 60 }, rng));
      const escaped = outs.filter((o) => !boxInside(o));
      expect(escaped.length, `${label}: ${escaped.length} ticks off the bedding`).toBe(0);
    }
  });

  it('never leaves the standing line, awake or asleep or dead', () => {
    // A walker's whole domain is one row. If any branch can move it off that row, the floor bounds are
    // not doing their job and the hamster would be drawn hovering.
    const cases: Array<Partial<PetInput>> = [
      {},
      { asleep: true },
      { label: 'hungry', hunger: 20 },
      { label: 'starving', hunger: 0 },
      { alive: false },
      { flakes: [{ x: 250, y: SEED_ROW }] },
    ];
    for (const over of cases) {
      const rng = seeded(3);
      const outs = run(400, () => input(over, rng));
      for (const o of outs) expect(o.y, JSON.stringify(over)).toBe(CAGE_STAND_Y);
    }
  });

  it('runs the wheel when content, and banks distance only while running', () => {
    // The rng is hoisted OUT of the per-tick closure on purpose. Built inside it, `seeded(11)` is a
    // fresh generator every tick and `rng()` returns the same first value forever -- which silently
    // pins every probabilistic branch to one outcome and makes the suite test almost nothing.
    const rng = seeded(11);
    const outs = run(3000, () => input({ label: 'full', hunger: 100 }, rng));
    const earning = outs.filter((o) => o.speciesDelta !== undefined);
    expect(earning.length, 'never used the wheel in 3000 ticks').toBeGreaterThan(0);
    // Every earning tick is pinned at the wheel: distance cannot be earned while walking about.
    const wheelX = siteX(CAGE_SITES['wheel']!);
    for (const o of earning) expect(o.x).toBeCloseTo(wheelX, 6);
    for (const o of earning) expect(o.speciesDelta?.['wheelKm']).toBeGreaterThan(0);
  });

  it('stops the wheel when hungry, which is the rule §8 actually states', () => {
    const rng = seeded(11);
    const outs = run(3000, () => input({ label: 'hungry', hunger: 20 }, rng));
    expect(outs.some((o) => o.speciesDelta !== undefined)).toBe(false);
    const rng2 = seeded(11);
    const starving = run(3000, () => input({ label: 'starving', hunger: 0 }, rng2));
    expect(starving.some((o) => o.speciesDelta !== undefined)).toBe(false);
  });

  it('scales wheel speed with fullness rather than running flat out at any hunger', () => {
    expect(wheelRate(100)).toBeCloseTo(1, 9);
    expect(wheelRate(65)).toBeCloseTo(0.5, 9);
    expect(wheelRate(30)).toBe(0);
    expect(wheelRate(0)).toBe(0);
    // Monotonic across the whole range: no hunger level makes the hamster faster than a fuller one.
    for (let h = 0; h < 100; h += 1) expect(wheelRate(h + 1)).toBeGreaterThanOrEqual(wheelRate(h));

    // And it shows up in the earnings: a full hamster banks more per running tick than a peckish one.
    const kmAt = (hunger: number): number => {
      const rng = seeded(11);
      const outs = run(3000, () => input({ label: hunger > 60 ? 'full' : 'peckish', hunger }, rng));
      return outs.reduce((a, o) => a + (o.speciesDelta?.['wheelKm'] ?? 0), 0);
    };
    expect(kmAt(100)).toBeGreaterThan(kmAt(50));
  });

  it('stuffs its cheeks at the hopper, but only when there is something in it', () => {
    const hopper = siteX(CAGE_SITES['hopper']!);
    const atSite = (outs: PetOutput[], x: number): boolean =>
      outs.some((o) => Math.abs(o.x - x) <= 1 && o.anim === 'eat');

    // Empty hopper: it never goes. Standing at an empty feeder miming a mouthful is worse than not.
    const empty = seeded(21);
    expect(atSite(run(4000, () => input({ pantryFraction: 0 }, empty)), hopper)).toBe(false);

    // Stocked: it does, and reports the eat pose while it is there.
    const full = seeded(21);
    expect(atSite(run(4000, () => input({ pantryFraction: 0.5 }, full)), hopper)).toBe(true);
  });

  it('never consumes the pantry, because the hopper is the $FEED store', () => {
    // Cheek-stuffing is cosmetic by design. The behaviour has no way to spend pantry -- the only
    // channel out of a tick is speciesDelta -- so what this pins is that it never invents one.
    const rng = seeded(22);
    const outs = run(4000, () => input({ pantryFraction: 1 }, rng));
    for (const o of outs) {
      for (const k of Object.keys(o.speciesDelta ?? {})) {
        expect(k, 'the behaviour emitted a counter that is not the wheel').toBe('wheelKm');
      }
    }
  });

  it('drinks from the bottle, which needs nothing to be available', () => {
    const bottle = siteX(CAGE_SITES['bottle']!);
    const rng = seeded(23);
    // Starved of every other option: no pantry to stuff from, and hunger too low to run the wheel...
    // except the wheel needs hunger > 30 and this is a content pet, so the bottle competes fairly.
    const outs = run(6000, () => input({ pantryFraction: 0 }, rng));
    expect(outs.some((o) => Math.abs(o.x - bottle) <= 1 && o.anim === 'eat')).toBe(true);
  });

  it('abandons an errand the moment it stops being available', () => {
    // The hopper empties WHILE the hamster is on its way, or mid-mouthful. It must break off rather
    // than finish miming at nothing, which is why availability is re-checked every tick and not only
    // when the errand is chosen.
    //
    // The pantry flips at random rather than at one chosen moment. Emptying it once relies on an
    // errand happening to straddle that tick; flipping it constantly means any errand that survives
    // an empty tick is caught. The first version of this test emptied the hopper when the hamster got
    // within 40 px of it, which it reached by ordinary wandering long before ever choosing the
    // errand — so the pantry was empty from the start and the test passed having proved nothing.
    const rng = seeded(24);
    const flip = seeded(99);
    const b = createHamsterBehavior();
    const hopper = siteX(CAGE_SITES['hopper']!);
    let mimedOnEmpty = false;
    for (let i = 0; i < 6000; i += 1) {
      const pantry = flip() < 0.5 ? 0 : 1;
      const o = b.step(input({ pantryFraction: pantry }, rng));
      if (pantry === 0 && Math.abs(o.x - hopper) <= 1 && o.anim === 'eat') mimedOnEmpty = true;
    }
    expect(mimedOnEmpty, 'mimed at an empty hopper').toBe(false);
  });

  it('goes to the hopper when hungry and to the bedding pile to sleep', () => {
    const hopper = siteX(CAGE_SITES['hopper']!);
    const rngA = seeded(5);
    const atHopper = run(600, () => input({ label: 'hungry', hunger: 20 }, rngA)).at(-1);
    expect(Math.abs((atHopper?.x ?? 0) - hopper)).toBeLessThanOrEqual(2);

    const bed = siteX(CAGE_SITES['bed']!);
    const rngB = seeded(5);
    const napping = run(600, () => input({ asleep: true }, rngB)).at(-1);
    expect(Math.abs((napping?.x ?? 0) - bed)).toBeLessThanOrEqual(2);
    expect(napping?.anim).toBe('sleep');
  });

  it('eats food on the bedding, and food outranks the wheel', () => {
    // Placed right next to the hamster's start so the bite lands inside the window.
    const rng = seeded(2);
    const outs = run(200, () => input({ flakes: [{ x: 150, y: SEED_ROW }] }, rng));
    expect(outs.some((o) => o.biteFlakeIndex === 0)).toBe(true);
    expect(outs.some((o) => o.anim === 'eat')).toBe(true);
    // Nothing was banked: a hamster with food in front of it is not on the wheel.
    expect(outs.some((o) => o.speciesDelta !== undefined)).toBe(false);
  });

  it('lies still when dead and does not drift', () => {
    const rng = seeded(9);
    const outs = run(300, () => input({ alive: false }, rng));
    const xs = new Set(outs.map((o) => o.x));
    expect(xs.size).toBe(1);
    for (const o of outs) expect(o.anim).toBe('dead');
  });

  it('reset returns it to the start, so a remount is not a continuation', () => {
    // Stated as equality with a freshly built behaviour fed the same rng stream, which is what "not a
    // continuation" actually means. The earlier form measured how far `moved` and `after` each sat
    // from the cage's centre and required `moved` to be the farther one -- an assertion about where a
    // 500-step pseudo-random walk happens to stop, not about `reset`. It held only while the sites sat
    // where they did; moving the wheel and the hopper to match the render left the walk ending near
    // the middle, and a test that reads the layout's geography rather than the code's behaviour tells
    // you nothing on the day it breaks.
    const fresh = createHamsterBehavior().step(input({}, seeded(4)));

    const rng = seeded(4);
    const b = createHamsterBehavior();
    for (let i = 0; i < 500; i += 1) b.step(input({}, rng));
    const moved = b.step(input({}, rng));
    b.reset();
    const after = b.step(input({}, seeded(4)));

    expect(after.x, 'reset left it where it had walked to').not.toBe(moved.x);
    expect(after.x).toBe(fresh.x);
    expect(after.y).toBe(fresh.y);
    expect(after.anim).toBe(fresh.anim);
  });
});
