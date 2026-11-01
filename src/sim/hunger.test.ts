import { describe, expect, it } from 'vitest';
import { hungerAt, hungerLabel, pantryDays, projectedDeathAt, zeroAt } from './hunger';
import { feed } from './feed';
import { reconcile } from './reconcile';
import { B, H, fresh } from './test-helpers';
import type { PetState } from './types';

describe('hunger', () => {
  it('1. decay math', () => {
    // A meal is half the bar and the bar is a day, so the readable landmarks are 12 h (half) and 24 h
    // (empty). 16.8 h is the 'hungry' boundary -- not round, because the labels sit at 60/30 and the
    // clock is a day; one of the two had to give and the day is the part the user feels.
    const s = fresh();
    expect(hungerAt(s, B)).toBe(100);
    expect(hungerAt(s, B + 6 * H)).toBeCloseTo(75, 9);
    expect(hungerAt(s, B + 12 * H)).toBeCloseTo(50, 9);
    expect(hungerAt(s, B + 16.8 * H)).toBeCloseTo(30, 9);
    expect(hungerAt(s, B + 24 * H)).toBeCloseTo(0, 9);
    expect(hungerAt(s, B + 90 * H)).toBe(0);
    expect(hungerAt(s, B - 1 * H)).toBe(100);
  });

  it('2. hungerLabel boundaries', () => {
    expect(hungerLabel(100)).toBe('full');
    expect(hungerLabel(60.01)).toBe('full');
    expect(hungerLabel(60)).toBe('peckish');
    expect(hungerLabel(30.01)).toBe('peckish');
    expect(hungerLabel(30)).toBe('hungry');
    expect(hungerLabel(0.01)).toBe('hungry');
    expect(hungerLabel(0)).toBe('starving');
  });

  it('3. zeroAt', () => {
    const s = fresh();
    expect(zeroAt(s)).toBe(B + 24 * H);
    // Fed at 18 h, when hunger reads 25: the meal takes it to 75, which is another 18 h of runway.
    const r = feed(s, B + 18 * H);
    expect(r.ok).toBe(true);
    expect(r.state.hungerAtLastFed).toBeCloseTo(75, 9);
    expect(zeroAt(r.state)).toBe(B + 36 * H);
    const dead = reconcile(s, B + 36 * H).state;
    expect(dead.alive).toBe(false);
    expect(zeroAt(dead)).toBe((dead.diedAt as number) - 12 * H);
  });

  it('4. projectedDeathAt', () => {
    const s = fresh();
    expect(projectedDeathAt(s, B)).toBe(B + 36 * H);
    expect(projectedDeathAt({ ...s, pantry: 24 }, B)).toBe(B + 36 * H);
    // 500 buys 20 auto-feeds: the first at 16.8 h, then every 12 h, so the last lands at 244.8 h and
    // takes hunger to 80. Empty 19.2 h later at 264 h, dead 12 h after that.
    expect(projectedDeathAt({ ...s, pantry: 500 }, B)).toBe(B + 276 * H);
    const dead = reconcile(s, B + 36 * H).state;
    expect(projectedDeathAt(dead, B + 300 * H)).toBe(dead.diedAt);
    // Projection from a later `now` matches a reconcile-then-project.
    const withPantry: PetState = { ...s, pantry: 500 };
    expect(projectedDeathAt(withPantry, B + 100 * H)).toBe(B + 276 * H);
  });

  it('5. pantryDays', () => {
    // Two meals a day at 25 each: a day is 50 of food, so the pantry holds exactly pantry/50 days.
    expect(pantryDays(500)).toBeCloseTo(10, 9);
    expect(pantryDays(475)).toBeCloseTo(9.5, 9);
    expect(pantryDays(0)).toBe(0);
    expect(pantryDays(99)).toBeLessThan(2);
    expect(pantryDays(100)).toBeGreaterThanOrEqual(2);
  });
});
