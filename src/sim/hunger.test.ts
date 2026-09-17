import { describe, expect, it } from 'vitest';
import { hungerAt, hungerLabel, pantryDays, projectedDeathAt, zeroAt } from './hunger';
import { feed } from './feed';
import { reconcile } from './reconcile';
import { LocalLedger } from './ledger';
import { B, H, fresh } from './test-helpers';
import type { PetState } from './types';

describe('hunger', () => {
  it('1. decay math', () => {
    const s = fresh();
    expect(hungerAt(s, B)).toBe(100);
    expect(hungerAt(s, B + 30 * H)).toBeCloseTo(50, 9);
    expect(hungerAt(s, B + 42 * H)).toBeCloseTo(30, 9);
    expect(hungerAt(s, B + 60 * H)).toBeCloseTo(0, 9);
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
    expect(zeroAt(s)).toBe(B + 60 * H);
    const r = feed(s, B + 50 * H, new LocalLedger(1000));
    expect(r.ok).toBe(true);
    expect(r.state.hungerAtLastFed).toBeCloseTo(61.6667, 3);
    expect(zeroAt(r.state)).toBe(B + 87 * H);
    const dead = reconcile(s, B + 84 * H).state;
    expect(dead.alive).toBe(false);
    expect(zeroAt(dead)).toBe((dead.diedAt as number) - 24 * H);
  });

  it('4. projectedDeathAt', () => {
    const s = fresh();
    expect(projectedDeathAt(s, B)).toBe(B + 84 * H);
    expect(projectedDeathAt({ ...s, pantry: 24 }, B)).toBe(B + 84 * H);
    expect(projectedDeathAt({ ...s, pantry: 500 }, B)).toBe(B + 624 * H);
    const dead = reconcile(s, B + 84 * H).state;
    expect(projectedDeathAt(dead, B + 300 * H)).toBe(dead.diedAt);
    // Projection from a later `now` matches a reconcile-then-project.
    const withPantry: PetState = { ...s, pantry: 500 };
    expect(projectedDeathAt(withPantry, B + 100 * H)).toBe(B + 624 * H);
  });

  it('5. pantryDays', () => {
    expect(pantryDays(500)).toBeCloseTo(22.5, 9);
    expect(pantryDays(475)).toBeCloseTo(21.375, 9);
    expect(pantryDays(0)).toBe(0);
    expect(pantryDays(44)).toBeLessThan(2);
    expect(pantryDays(45)).toBeGreaterThanOrEqual(2);
  });
});
