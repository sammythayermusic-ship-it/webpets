import { describe, expect, it } from 'vitest';
import { feed } from './feed';
import { hungerAt } from './hunger';
import { reconcile } from './reconcile';
import { DEFAULT_CONSTANTS } from './constants';
import { B, H, fresh } from './test-helpers';

describe('feed', () => {
  it('6. feed cap', () => {
    const s = fresh();
    const r = feed(s, B);
    expect(r.ok).toBe(true);
    expect(r.state.hungerAtLastFed).toBe(100);
    expect(r.state.meals).toBe(1);
    expect(r.state.foodEaten).toBe(25);
    expect(r.state.pantry).toBe(0);
    expect(r.state.lastFedAt).toBe(B);
    expect(r.state.lastReconciledAt).toBe(B);
    expect(r.events).toEqual([]);
  });

  it('7. feed adds FEED_GAIN from the current hunger', () => {
    const s = fresh();
    const a = feed(s, B + 16.8 * H);
    expect(a.ok).toBe(true);
    expect(a.state.hungerAtLastFed).toBeCloseTo(80, 9);
    const b = feed(s, B + 24 * H);
    expect(b.ok).toBe(true);
    expect(b.state.hungerAtLastFed).toBeCloseTo(50, 9);
  });

  it('8. feeding is free: meal after meal succeeds and never touches the feeder', () => {
    let s = { ...fresh(), pantry: 50 };
    for (let i = 1; i <= 40; i++) {
      const r = feed(s, B + i * 1000);
      expect(r.ok).toBe(true);
      s = r.state;
    }
    expect(s.meals).toBe(40);
    expect(s.foodEaten).toBe(40 * DEFAULT_CONSTANTS.MEAL_SIZE);
    expect(s.pantry).toBe(50);
    expect(s.hungerAtLastFed).toBe(100);
  });

  it('9. dead pet cannot be fed', () => {
    const s = fresh();
    const dead = reconcile(s, B + 36 * H).state;
    const r = feed(dead, B + 40 * H);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('dead');
    expect(r.state).toBe(dead);
    expect(r.events).toEqual([]);
  });

  it('10. feed reconciles first', () => {
    const s = { ...fresh(), pantry: 100 };
    const now = B + 48 * H;
    const r = feed(s, now);
    expect(r.ok).toBe(true);
    // First auto-feed at the 'hungry' crossing, then one every 12 h: 30 -> 80 is half the bar, the
    // same half a manual meal buys.
    expect(r.events.map((e) => e.type)).toEqual(['auto-fed', 'auto-fed', 'auto-fed']);
    expect(r.events.map((e) => e.at)).toEqual([B + 16.8 * H, B + 28.8 * H, B + 40.8 * H]);
    expect(r.state.pantry).toBe(25);
    expect(r.state.meals).toBe(4);
    expect(r.state.foodEaten).toBe(100);
    const afterAuto = reconcile(s, now).state;
    expect(hungerAt(afterAuto, now)).toBeCloseTo(50, 9);
    expect(r.state.hungerAtLastFed).toBe(Math.min(100, hungerAt(afterAuto, now) + 50));
    expect(r.state.lastFedAt).toBe(now);
    expect(r.state.lastReconciledAt).toBe(now);
  });

  it('feed with a backwards clock applies the gain on top of the hunger already reached', () => {
    // Skip 6 h (hunger 75), then the clock moves back to B (dev.resetClock or a system clock correction).
    // 75 + 50 overshoots the bar, so this also pins the cap.
    const skipped = reconcile(fresh(), B + 6 * H).state;
    expect(hungerAt(skipped, B + 6 * H)).toBeCloseTo(75, 9);
    const r = feed(skipped, B);
    expect(r.ok).toBe(true);
    expect(r.state.meals).toBe(1);
    // Anchored at lastReconciledAt, not at `now`: the meal is visible once real time catches up.
    expect(r.state.lastFedAt).toBe(B + 6 * H);
    expect(r.state.lastReconciledAt).toBe(B + 6 * H);
    expect(r.state.hungerAtLastFed).toBe(100);
    expect(hungerAt(r.state, B + 6 * H)).toBe(100);
    expect(r.events).toEqual([]);
  });

  it('feed with a backwards clock gains from a partial hunger', () => {
    const skipped = reconcile(fresh(), B + 16.8 * H).state; // hunger 30
    const r = feed(skipped, B + 10 * H);
    expect(r.ok).toBe(true);
    expect(r.state.hungerAtLastFed).toBeCloseTo(80, 9);
    expect(r.state.lastFedAt).toBe(B + 16.8 * H);
    expect(r.state.lastReconciledAt).toBe(B + 16.8 * H);
  });
});
