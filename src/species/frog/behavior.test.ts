import { describe, expect, it } from 'vitest';
import { CROAK_TICKS, HOP_TICKS, TONGUE_RANGE, createFrogBehavior } from './behavior';
import { FROG_BODY, FROG_MOUTH, JAR_SITES, POND_BANK, POND_FLOOR_RECT, POND_SITES, POND_STAND_Y } from './layout';
import { makeFloorBounds } from '../../render/water';
import type { PetInput, PetOutput } from '../../render/types';
import type { Rng } from '../../sim/types';

const bounds = makeFloorBounds({ rect: POND_FLOOR_RECT, standY: POND_STAND_Y });
const PAD = POND_SITES['pad']!;
const ROCK = POND_SITES['rock']!;

function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function input(over: Partial<PetInput> = {}, rng: Rng = seeded(1)): PetInput {
  return { hunger: 100, label: 'full', alive: true, asleep: false, flakes: [], bounds, body: FROG_BODY, pantryFraction: 0, attract: null, rng, ...over };
}

/** Never draws below 0.5: no urge fires, so only what the test asks for happens. */
const calm: Rng = () => 0.99;

function run(ticks: number, make: (i: number, prev: PetOutput | null) => PetInput, b = createFrogBehavior()): PetOutput[] {
  const outs: PetOutput[] = [];
  for (let i = 0; i < ticks; i += 1) outs.push(b.step(make(i, outs[i - 1] ?? null)));
  return outs;
}

const onPerch = (o: PetOutput): 'pad' | 'rock' | null =>
  Math.hypot(o.x - PAD.x, o.y - PAD.y) < 0.01 ? 'pad' : Math.hypot(o.x - ROCK.x, o.y - ROCK.y) < 0.01 ? 'rock' : null;

describe('frog: sitting', () => {
  it('starts on the lily pad and stays put when nothing happens', () => {
    const outs = run(200, () => input({}, calm));
    for (const o of outs) {
      expect(onPerch(o)).toBe('pad');
      expect(o.anim).toBe('idle');
      expect(o.biteFlakeIndex).toBeNull();
    }
  });

  it('is only ever on a perch or in a hop between them, over a long day', () => {
    const rng = seeded(7);
    const outs = run(8000, () => input({}, rng));
    let hops = 0;
    for (let i = 0; i < outs.length; i += 1) {
      const o = outs[i]!;
      if (onPerch(o) === null) {
        expect(o.act).toBe('hop');
        // in the air: above the line between the perches, between them in x
        expect(o.x).toBeGreaterThan(PAD.x - 0.01);
        expect(o.x).toBeLessThan(ROCK.x + 0.01);
        expect(o.y).toBeLessThan(Math.max(PAD.y, ROCK.y));
      }
      if (o.act === 'hop' && outs[i - 1]?.act !== 'hop') hops += 1;
    }
    // it crosses now and then (about every half minute), not constantly and not never
    expect(hops).toBeGreaterThan(4);
    expect(hops).toBeLessThan(40);
  });

  it('a hop takes HOP_TICKS, starts and ends on a perch, and faces where it is going', () => {
    const b = createFrogBehavior();
    b.step(input({}, calm));
    const outs = run(HOP_TICKS + 2, (i) => input(i === 0 ? { tap: { x: 100, y: 100 } } : {}, calm), b);
    const air = outs.filter((o) => onPerch(o) === null);
    expect(air.length).toBe(HOP_TICKS - 1);
    expect(onPerch(outs[HOP_TICKS]!)).toBe('rock');
    for (const o of air) expect(o.facing).toBe(1);
    // and x only ever advances: no sliding back mid-air
    for (let i = 1; i < air.length; i += 1) expect(air[i]!.x).toBeGreaterThan(air[i - 1]!.x);
  });

  it('uses the perches of the habitat it is in', () => {
    const b = createFrogBehavior(JAR_SITES);
    const o = b.step(input({}, calm));
    expect(o.x).toBe(JAR_SITES['pad']!.x);
    expect(o.y).toBe(JAR_SITES['pad']!.y);
  });
});

describe('frog: croaking', () => {
  it('croaks when you come to look, then waits before croaking again', () => {
    const outs = run(CROAK_TICKS + 30, () => input({ attract: { x: 250, y: 100, strength: 0.8 } }, calm));
    expect(outs[0]!.act).toBe('croak');
    const croaks = outs.filter((o) => o.act === 'croak').length;
    expect(croaks).toBe(CROAK_TICKS + 1);
    expect(outs[CROAK_TICKS + 5]!.act).toBeUndefined();
  });

  it('does not croak when hungry or asleep', () => {
    for (const over of [{ label: 'hungry' as const, hunger: 20 }, { asleep: true }]) {
      const outs = run(120, () => input({ ...over, attract: { x: 250, y: 100, strength: 1 } }, seeded(3)));
      expect(outs.some((o) => o.act === 'croak')).toBe(false);
    }
  });
});

describe('frog: states', () => {
  it('sinks low when hungry, sleeps at night, lies dead, and never hops in any of them', () => {
    const cases: Array<[Partial<PetInput>, string]> = [
      [{ label: 'hungry', hunger: 20 }, 'hungry'],
      [{ label: 'starving', hunger: 0 }, 'hungry'],
      [{ asleep: true }, 'sleep'],
      [{ alive: false }, 'dead'],
    ];
    for (const [over, anim] of cases) {
      const outs = run(600, () => input(over, seeded(5)));
      for (const o of outs) {
        expect(o.anim).toBe(anim);
        expect(onPerch(o)).toBe('pad');
      }
    }
  });

  it('a frog that dies in mid-hop is drawn dead on a perch, not in the air', () => {
    const b = createFrogBehavior();
    b.step(input({ tap: { x: 0, y: 0 } }, calm));
    b.step(input({}, calm));
    const o = b.step(input({ alive: false }, calm));
    expect(o.anim).toBe('dead');
    expect(onPerch(o)).not.toBeNull();
  });
});

describe('frog: hunting', () => {
  const mouth = { x: PAD.x + FROG_MOUTH[0], y: PAD.y + FROG_MOUTH[1] };
  const near = { x: Math.round(mouth.x + 20), y: Math.round(POND_BANK.y) };

  it('watches a cricket in reach, then strikes and catches it', () => {
    const b = createFrogBehavior();
    const outs: PetOutput[] = [];
    let flakes = [near];
    for (let i = 0; i < 60 && flakes.length > 0; i += 1) {
      const o = b.step(input({ flakes }, seeded(11)));
      outs.push(o);
      if (o.biteFlakeIndex !== null) flakes = [];
    }
    const strike = outs.findIndex((o) => o.reach !== undefined);
    // it waits first: a strike on the very first tick would not read as hunting
    expect(strike).toBeGreaterThanOrEqual(2);
    expect(outs[strike]!.act).toBe('snap');
    expect(outs[strike]!.reach).toEqual(near);
    const hit = outs[strike + 1]!;
    expect(hit.biteFlakeIndex).toBe(0);
    expect(hit.reach?.caught).toBe(true);
    expect(hit.speciesDelta).toEqual({ cricketsCaught: 1 });
  });

  it('turns to face a cricket behind it before striking', () => {
    const behind = { x: Math.round(PAD.x - 40), y: Math.round(POND_BANK.y) };
    const outs = run(40, () => input({ flakes: [behind] }, seeded(2)));
    const strike = outs.findIndex((o) => o.reach !== undefined);
    expect(strike).toBeGreaterThan(0);
    expect(outs[0]!.turning).toBe(true);
    for (const o of outs.slice(0, strike + 1)) expect(o.facing).toBe(-1);
  });

  it('misses a cricket that hopped away, and frightens it', () => {
    const b = createFrogBehavior();
    let struck = -1;
    const outs: PetOutput[] = [];
    for (let i = 0; i < 60; i += 1) {
      // the cricket jumps 12 px the tick after the tongue leaves
      const moved = struck >= 0 ? { x: near.x + 12, y: near.y } : near;
      const o = b.step(input({ flakes: [moved] }, seeded(11)));
      outs.push(o);
      if (struck < 0 && o.reach !== undefined) struck = i;
      if (struck >= 0 && i === struck + 1) break;
    }
    const after = outs[outs.length - 1]!;
    expect(after.biteFlakeIndex).toBeNull();
    expect(after.speciesDelta).toBeUndefined();
    expect(after.scareFlakeIndex).toBe(0);
  });

  it('never strikes at a cricket out of reach, and hops over when the other perch is nearer to it', () => {
    // off the right end of the bank: out of reach from the pad, in reach from the rock
    const far = { x: Math.round(POND_BANK.x1) + 14, y: Math.round(POND_BANK.y) };
    expect(Math.hypot(far.x - mouth.x, far.y - mouth.y)).toBeGreaterThan(TONGUE_RANGE);
    const outs = run(120, () => input({ flakes: [far] }, seeded(4)));
    const firstReach = outs.findIndex((o) => o.reach !== undefined);
    const firstHop = outs.findIndex((o) => o.act === 'hop');
    expect(firstHop).toBeGreaterThan(0);
    expect(firstReach).toBeGreaterThan(firstHop);
    // every strike is thrown from within reach
    outs.forEach((o, i) => {
      if (o.reach === undefined || outs[i - 1]?.reach !== undefined) return;
      const mx = o.x + o.facing * FROG_MOUTH[0];
      expect(Math.hypot(o.reach.x - mx, o.reach.y - (o.y + FROG_MOUTH[1]))).toBeLessThanOrEqual(TONGUE_RANGE);
    });
  });

  it('can reach every part of the bank from one perch or the other', () => {
    for (let bx = POND_BANK.x0; bx <= POND_BANK.x1; bx += 2) {
      const reach = [PAD, ROCK].map((p) => {
        const f = bx >= p.x ? 1 : -1;
        return Math.hypot(bx - (p.x + f * FROG_MOUTH[0]), POND_BANK.y - (p.y + FROG_MOUTH[1]));
      });
      expect(Math.min(...reach)).toBeLessThanOrEqual(TONGUE_RANGE);
    }
  });

  it('catches most of a feed of live crickets', async () => {
    const { cricketStep, cricketPos, CRICKET_ESCAPE_STEPS } = await import('../../render/crickets');
    let caught = 0;
    let escaped = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = seeded(seed * 13);
      const b = createFrogBehavior();
      const span = POND_BANK.x1 - POND_BANK.x0;
      let crickets = [0, 1, 2].map((i) => ({ x: POND_BANK.x0 - 5, toX: POND_BANK.x0 + span * (0.1 + 0.25 * i), hop: 1, rest: 0, age: 0, fleeing: false, row: 0, gone: false }));
      for (let t = 0; t < CRICKET_ESCAPE_STEPS + 80 && crickets.length > 0; t += 1) {
        for (const c of crickets) cricketStep(c, POND_BANK, rng);
        escaped += crickets.filter((c) => c.gone).length;
        crickets = crickets.filter((c) => !c.gone);
        const flakes = crickets.map((c) => {
          const p = cricketPos(c, POND_BANK, 0);
          return { x: Math.round(p.x), y: Math.round(p.y) };
        });
        const o = b.step(input({ flakes }, rng));
        if (o.scareFlakeIndex !== undefined) crickets[o.scareFlakeIndex]!.fleeing = true;
        if (o.biteFlakeIndex !== null) {
          crickets.splice(o.biteFlakeIndex, 1);
          caught += 1;
        }
      }
    }
    expect(caught + escaped).toBe(60);
    // a show, not a massacre and not a famine: most are caught, some get away
    expect(caught).toBeGreaterThanOrEqual(36);
    expect(escaped).toBeGreaterThanOrEqual(2);
  });
});
