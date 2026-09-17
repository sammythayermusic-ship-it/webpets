import { describe, expect, it } from 'vitest';
import { LocalLedger } from './ledger';
import { depositPantry, feed, withdrawPantry } from './feed';
import { reconcile } from './reconcile';
import { B, H, fresh, mulberry32 } from './test-helpers';
import type { PetState } from './types';

describe('ledger and pantry', () => {
  it('27. LocalLedger validation', () => {
    const l = new LocalLedger(1000);
    l.burn(25);
    expect(l.balance()).toBe(975);
    expect(() => l.burn(1001)).toThrow(RangeError);
    expect(l.balance()).toBe(975);
    expect(() => l.burn(-1)).toThrow(RangeError);
    expect(() => l.burn(1.5)).toThrow(RangeError);
    expect(() => l.burn(Number.NaN)).toThrow(RangeError);
    expect(() => l.debit(-1)).toThrow(RangeError);
    expect(() => l.debit(976)).toThrow(RangeError);
    expect(() => l.credit(-1)).toThrow(RangeError);
    expect(() => l.credit(2.5)).toThrow(RangeError);
    expect(l.balance()).toBe(975);
    l.debit(100);
    expect(l.balance()).toBe(875);
    l.credit(100);
    expect(l.balance()).toBe(975);
    expect(l.toJSON()).toBe(975);
    expect(JSON.stringify({ l })).toBe('{"l":975}');
  });

  it('28. no negative balances', () => {
    const l = new LocalLedger(1000);
    const a = depositPantry(fresh(), 2000, B, l);
    expect(a.moved).toBe(1000);
    expect(l.balance()).toBe(0);
    expect(a.state.pantry).toBe(1000);
    const b = depositPantry(fresh(), -5, B, new LocalLedger(1000));
    expect(b.moved).toBe(0);
    expect(b.state.pantry).toBe(0);
    const c = depositPantry(fresh(), 12.7, B, new LocalLedger(1000));
    expect(c.moved).toBe(12);
    expect(c.state.pantry).toBe(12);
    const n = depositPantry(fresh(), Number.NaN, B, new LocalLedger(1000));
    expect(n.moved).toBe(0);
    const f = feed(fresh(), B, l);
    expect(f.ok).toBe(false);
    expect(l.balance()).toBe(0);
    const r = reconcile({ ...fresh(), pantry: 30 }, B + 240 * H);
    expect(r.events.filter((e) => e.type === 'auto-fed')).toHaveLength(1);
    expect(r.state.pantry).toBe(5);
  });

  it('29. withdrawPantry', () => {
    const l = new LocalLedger(1000);
    const d = depositPantry(fresh(), 300, B, l);
    const w = withdrawPantry(d.state, B + H, l);
    expect(w.moved).toBe(300);
    expect(w.state.pantry).toBe(0);
    expect(l.balance()).toBe(1000);
    expect(w.state.lastReconciledAt).toBe(B + H);

    const l2 = new LocalLedger(1000);
    const d2 = depositPantry(fresh(), 24, B, l2);
    const dead = reconcile(d2.state, B + 84 * H).state;
    expect(dead.alive).toBe(false);
    const w2 = withdrawPantry(dead, B + 100 * H, l2);
    expect(w2.moved).toBe(24);
    expect(w2.state.pantry).toBe(0);
    expect(w2.state.alive).toBe(false);
    expect(l2.balance()).toBe(1000);
  });

  it('30. conservation invariant over 500 random ops', () => {
    const rng = mulberry32(42);
    const l = new LocalLedger(1000);
    let s: PetState = fresh();
    let now = B;
    const check = () => {
      expect(l.balance() + s.pantry + s.feedBurned).toBe(1000);
      for (const v of [l.balance(), s.pantry, s.feedBurned, s.meals]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(s.lastReconciledAt).toBeGreaterThanOrEqual(s.lastFedAt);
    };
    for (let i = 0; i < 500; i++) {
      now += Math.floor(rng() * 20 * H);
      const op = rng();
      if (op < 0.25) {
        s = feed(s, now, l).state;
      } else if (op < 0.5) {
        s = depositPantry(s, Math.floor(rng() * 400) - 20, now, l).state;
      } else if (op < 0.65) {
        s = withdrawPantry(s, now, l).state;
      } else {
        s = reconcile(s, now).state;
      }
      check();
    }
  });
});
