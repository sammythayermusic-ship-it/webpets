import { describe, expect, it } from 'vitest';
import { CRICKET_ESCAPE_STEPS, HOP_STEPS, cricketPos, cricketStep, type CricketState } from './crickets';

const SPEC = { x0: 100, x1: 220, y: 158 };

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const fresh = (x = 160): CricketState => ({ x, toX: x, hop: 0, rest: 0, age: 0, fleeing: false, row: 0, gone: false });

describe('crickets', () => {
  it('stay on the bank while they are at large', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = seeded(seed);
      const c = fresh(100 + (seed * 4) % 120);
      for (let t = 0; t < CRICKET_ESCAPE_STEPS - 1; t += 1) {
        cricketStep(c, SPEC, rng);
        const p = cricketPos(c, SPEC, 0);
        expect(p.x).toBeGreaterThanOrEqual(SPEC.x0 - 0.001);
        expect(p.x).toBeLessThanOrEqual(SPEC.x1 + 0.001);
        expect(c.gone).toBe(false);
      }
    }
  });

  it('hop in an arc: off the ground mid-hop, on it at rest', () => {
    const c = fresh();
    const rng = seeded(3);
    let sawAir = false;
    for (let t = 0; t < 60; t += 1) {
      cricketStep(c, SPEC, rng);
      const p = cricketPos(c, SPEC, 0.5);
      if (c.hop > 0) {
        expect(p.y).toBeLessThan(SPEC.y);
        sawAir = true;
      } else {
        expect(p.y).toBe(SPEC.y);
      }
    }
    expect(sawAir).toBe(true);
  });

  it('give up after twenty seconds and leave by the nearer end', () => {
    for (const [start, side] of [[130, -1], [200, 1]] as const) {
      const c = fresh(start);
      const rng = seeded(9);
      // held still until its time is up, so "the nearer end" is the end nearer where it started
      c.rest = CRICKET_ESCAPE_STEPS;
      let steps = 0;
      while (!c.gone && steps < CRICKET_ESCAPE_STEPS + 200) {
        cricketStep(c, SPEC, rng);
        steps += 1;
      }
      expect(c.gone).toBe(true);
      expect(steps).toBeGreaterThanOrEqual(CRICKET_ESCAPE_STEPS);
      expect(Math.sign(c.x - 160)).toBe(side);
    }
  });

  it('a frightened one leaves at once, hop after hop with no rest', () => {
    const c = fresh(180);
    c.fleeing = true;
    const rng = seeded(1);
    let steps = 0;
    while (!c.gone && steps < 100) {
      cricketStep(c, SPEC, rng);
      steps += 1;
    }
    expect(c.gone).toBe(true);
    // 50 px to the end and past it in 20 px hops of HOP_STEPS+1 steps each
    expect(steps).toBeLessThanOrEqual(4 * (HOP_STEPS + 1) + 2);
  });
});
