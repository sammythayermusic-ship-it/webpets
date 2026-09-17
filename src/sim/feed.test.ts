import { describe, expect, it } from 'vitest';
import { feed } from './feed';
import { hungerAt } from './hunger';
import { reconcile } from './reconcile';
import { LocalLedger } from './ledger';
import { B, H, fresh } from './test-helpers';

describe('feed', () => {
  it('6. feed cap', () => {
    const s = fresh();
    const ledger = new LocalLedger(1000);
    const r = feed(s, B, ledger);
    expect(r.ok).toBe(true);
    expect(r.state.hungerAtLastFed).toBe(100);
    expect(ledger.balance()).toBe(975);
    expect(r.state.meals).toBe(1);
    expect(r.state.feedBurned).toBe(25);
    expect(r.state.lastFedAt).toBe(B);
    expect(r.state.lastReconciledAt).toBe(B);
    expect(r.events).toEqual([]);
  });

  it('7. feed adds FEED_GAIN from the current hunger', () => {
    const s = fresh();
    const a = feed(s, B + 42 * H, new LocalLedger(1000));
    expect(a.ok).toBe(true);
    expect(a.state.hungerAtLastFed).toBeCloseTo(75, 9);
    const b = feed(s, B + 60 * H, new LocalLedger(1000));
    expect(b.ok).toBe(true);
    expect(b.state.hungerAtLastFed).toBeCloseTo(45, 9);
  });

  it('8. insufficient balance', () => {
    const s = fresh();
    const ledger = new LocalLedger(24);
    const now = B + 50 * H;
    const r = feed(s, now, ledger);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('insufficient-balance');
    expect(ledger.balance()).toBe(24);
    expect(r.state).toEqual(reconcile(s, now).state);
    expect(r.events).toEqual(reconcile(s, now).events);
    expect(r.state.meals).toBe(0);
  });

  it('9. dead pet cannot be fed', () => {
    const s = fresh();
    const dead = reconcile(s, B + 84 * H).state;
    const ledger = new LocalLedger(1000);
    const r = feed(dead, B + 90 * H, ledger);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('dead');
    expect(ledger.balance()).toBe(1000);
    expect(r.state).toBe(dead);
  });

  it('10. feed reconciles first', () => {
    const s = { ...fresh(), pantry: 100 };
    const ledger = new LocalLedger(1000);
    const now = B + 100 * H;
    const r = feed(s, now, ledger);
    expect(r.ok).toBe(true);
    expect(r.events.map((e) => e.type)).toEqual(['auto-fed', 'auto-fed', 'auto-fed']);
    expect(r.events.map((e) => e.at)).toEqual([B + 42 * H, B + 69 * H, B + 96 * H]);
    expect(r.state.pantry).toBe(25);
    expect(r.state.meals).toBe(4);
    expect(r.state.feedBurned).toBe(100);
    expect(ledger.balance()).toBe(975);
    const afterAuto = reconcile(s, now).state;
    expect(hungerAt(afterAuto, now)).toBeCloseTo(68.333, 2);
    expect(r.state.hungerAtLastFed).toBe(Math.min(100, hungerAt(afterAuto, now) + 45));
    expect(r.state.lastFedAt).toBe(now);
    expect(r.state.lastReconciledAt).toBe(now);
  });

  it('feed with a backwards clock applies the gain on top of the hunger already reached', () => {
    // Skip 12 h (hunger 80), then the clock moves back to B (dev.resetClock or a system clock correction).
    const skipped = reconcile(fresh(), B + 12 * H).state;
    expect(hungerAt(skipped, B + 12 * H)).toBeCloseTo(80, 9);
    const ledger = new LocalLedger(1000);
    const r = feed(skipped, B, ledger);
    expect(r.ok).toBe(true);
    expect(ledger.balance()).toBe(975);
    expect(r.state.meals).toBe(1);
    // Anchored at lastReconciledAt, not at `now`: the meal is visible once real time catches up.
    expect(r.state.lastFedAt).toBe(B + 12 * H);
    expect(r.state.lastReconciledAt).toBe(B + 12 * H);
    expect(r.state.hungerAtLastFed).toBe(100);
    expect(hungerAt(r.state, B + 12 * H)).toBe(100);
    expect(r.events).toEqual([]);
  });

  it('feed with a backwards clock gains from a partial hunger', () => {
    const skipped = reconcile(fresh(), B + 42 * H).state; // hunger 30
    const r = feed(skipped, B + 10 * H, new LocalLedger(1000));
    expect(r.ok).toBe(true);
    expect(r.state.hungerAtLastFed).toBeCloseTo(75, 9);
    expect(r.state.lastFedAt).toBe(B + 42 * H);
    expect(r.state.lastReconciledAt).toBe(B + 42 * H);
  });
});
