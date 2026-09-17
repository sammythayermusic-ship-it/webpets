import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';
import { depositPantry } from './feed';
import { hungerAt, zeroAt } from './hunger';
import { LocalLedger } from './ledger';
import { B, H, fresh } from './test-helpers';
import type { PetState, SimEvent } from './types';

const autoFed = (e: SimEvent): e is Extract<SimEvent, { type: 'auto-fed' }> => e.type === 'auto-fed';

describe('reconcile', () => {
  it('11. pantry auto-feed timing over a 10-day gap with 500', () => {
    const ledger = new LocalLedger(1000);
    const dep = depositPantry(fresh(), 500, B, ledger);
    expect(dep.moved).toBe(500);
    expect(dep.events).toEqual([]);
    const r = reconcile(dep.state, B + 240 * H);
    expect(r.events).toHaveLength(8);
    r.events.forEach((e, k) => {
      expect(autoFed(e)).toBe(true);
      if (!autoFed(e)) return;
      expect(e.at).toBe(B + (42 + 27 * k) * H);
      expect(e.hungerAfter).toBeCloseTo(75, 6);
      expect(e.pantryAfter).toBe(475 - 25 * k);
    });
    expect(r.state.pantry).toBe(300);
    expect(r.state.meals).toBe(8);
    expect(r.state.feedBurned).toBe(200);
    expect(ledger.balance()).toBe(500);
    expect(r.state.alive).toBe(true);
    expect(hungerAt(r.state, B + 240 * H)).toBeCloseTo(60, 6);
  });

  it('12. death exactly at 24h-at-zero', () => {
    const s = fresh();
    const a = reconcile(s, B + 84 * H - 1);
    expect(a.state.alive).toBe(true);
    expect(a.events).toEqual([
      { type: 'hungry', at: B + 42 * H },
      { type: 'starving', at: B + 60 * H },
      { type: 'dying-soon', at: B + 78 * H, diesAt: B + 84 * H },
    ]);
    const b = reconcile(a.state, B + 84 * H);
    expect(b.state.alive).toBe(false);
    expect(b.state.diedAt).toBe(B + 84 * H);
    expect(b.events).toEqual([{ type: 'died', at: B + 84 * H }]);
    expect(hungerAt(b.state, B + 84 * H)).toBe(0);
    const c = reconcile(b.state, B + 200 * H);
    expect(c.state).toEqual(b.state);
    expect(c.events).toEqual([]);
  });

  it('13. catch-up event list single shot', () => {
    const r = reconcile(fresh(), B + 84 * H);
    expect(r.events).toEqual([
      { type: 'hungry', at: B + 42 * H },
      { type: 'starving', at: B + 60 * H },
      { type: 'dying-soon', at: B + 78 * H, diesAt: B + 84 * H },
      { type: 'died', at: B + 84 * H },
    ]);
  });

  it('14. path independence', () => {
    const s: PetState = { ...fresh(), pantry: 500 };
    const oneShot = reconcile(s, B + 240 * H);
    let cur = s;
    const evs: SimEvent[] = [];
    for (let t = B + H; t <= B + 240 * H; t += H) {
      const r = reconcile(cur, t);
      cur = r.state;
      evs.push(...r.events);
    }
    expect(evs).toEqual(oneShot.events);
    expect(cur).toEqual(oneShot.state);

    const threeDays = reconcile(s, B + 72 * H);
    cur = s;
    const evs2: SimEvent[] = [];
    for (let t = B + 30_000; t <= B + 72 * H; t += 30_000) {
      const r = reconcile(cur, t);
      cur = r.state;
      evs2.push(...r.events);
    }
    expect(evs2).toEqual(threeDays.events);
    expect(cur).toEqual(threeDays.state);
  });

  it('15. reconcile is idempotent (including at event times)', () => {
    const cases: Array<{ s: PetState; t: number }> = [
      { s: { ...fresh(), pantry: 25 }, t: B + 42 * H },
      { s: fresh(), t: B + 60 * H },
      { s: fresh(), t: B + 84 * H },
      { s: { ...fresh(), pantry: 500 }, t: B + 240 * H },
    ];
    for (const { s, t } of cases) {
      const r1 = reconcile(s, t);
      const r2 = reconcile(r1.state, t);
      expect(r2.state).toEqual(r1.state);
      expect(r2.events).toEqual([]);
    }
  });

  it('16. events before from are never re-emitted', () => {
    const a = reconcile(fresh(), B + 50 * H);
    expect(a.events).toEqual([{ type: 'hungry', at: B + 42 * H }]);
    const b = reconcile(a.state, B + 90 * H);
    expect(b.events).toEqual([
      { type: 'starving', at: B + 60 * H },
      { type: 'dying-soon', at: B + 78 * H, diesAt: B + 84 * H },
      { type: 'died', at: B + 84 * H },
    ]);
  });

  it('17. once per cycle', () => {
    const r = reconcile({ ...fresh(), pantry: 25 }, B + 120 * H);
    expect(r.events).toEqual([
      { type: 'auto-fed', at: B + 42 * H, pantryAfter: 0, hungerAfter: expect.closeTo(75, 6) as unknown as number },
      { type: 'hungry', at: B + 69 * H },
      { type: 'starving', at: B + 87 * H },
      { type: 'dying-soon', at: B + 105 * H, diesAt: B + 111 * H },
      { type: 'died', at: B + 111 * H },
    ]);
    expect(r.events.filter((e) => e.type === 'hungry')).toHaveLength(1);
  });

  it('18. hungry not emitted at a fed crossing; emitted when pantry < cost', () => {
    const fed = reconcile({ ...fresh(), pantry: 25 }, B + 50 * H);
    expect(fed.events.map((e) => e.type)).toEqual(['auto-fed']);
    const poor = reconcile({ ...fresh(), pantry: 24 }, B + 50 * H);
    expect(poor.events).toEqual([{ type: 'hungry', at: B + 42 * H }]);
    expect(poor.state.pantry).toBe(24);
  });

  it('19. no retroactive feed', () => {
    const ledger = new LocalLedger(1000);
    const a = reconcile(fresh(), B + 50 * H);
    expect(a.events).toEqual([{ type: 'hungry', at: B + 42 * H }]);
    const d = depositPantry(a.state, 100, B + 50 * H, ledger);
    expect(d.moved).toBe(100);
    expect(d.events).toHaveLength(1);
    const e = d.events[0];
    expect(e && autoFed(e)).toBe(true);
    if (!e || !autoFed(e)) return;
    expect(e.at).toBe(B + 50 * H);
    expect(e.hungerAfter).toBeCloseTo(61.6667, 3);
    expect(d.state.pantry).toBe(75);
    expect(ledger.balance()).toBe(900);
    expect(d.events.filter((x) => x.type === 'hungry')).toHaveLength(0);
  });

  it('20. deposit rescue', () => {
    const ledger = new LocalLedger(1000);
    const a = reconcile(fresh(), B + 70 * H);
    expect(a.events.map((e) => e.type)).toEqual(['hungry', 'starving']);
    const d = depositPantry(a.state, 25, B + 70 * H, ledger);
    expect(d.moved).toBe(25);
    expect(d.events).toEqual([{ type: 'auto-fed', at: B + 70 * H, pantryAfter: 0, hungerAfter: 45 }]);
    expect(d.state.alive).toBe(true);
    const r = reconcile(d.state, B + 100 * H);
    expect(r.state.alive).toBe(true);
    expect(zeroAt(d.state)).toBe(B + 97 * H);
  });

  it('21. deposit too late', () => {
    const ledger = new LocalLedger(1000);
    const dead = reconcile(fresh(), B + 84 * H).state;
    expect(dead.alive).toBe(false);
    const d = depositPantry(dead, 500, B + 85 * H, ledger);
    expect(d.moved).toBe(0);
    expect(ledger.balance()).toBe(1000);
    expect(d.events).toEqual([]);
    expect(d.state).toBe(dead);
  });

  it('22. deposit below cost', () => {
    const ledger = new LocalLedger(1000);
    const d = depositPantry(fresh(), 10, B + 50 * H, ledger);
    expect(d.moved).toBe(10);
    expect(d.events.filter(autoFed)).toHaveLength(0);
    expect(d.state.pantry).toBe(10);
    expect(ledger.balance()).toBe(990);
  });

  it('23. hungerAtLastFed <= 30 (dev-injected) feeds at from', () => {
    const R = B + 5 * H;
    const s: PetState = { ...fresh(), hungerAtLastFed: 20, lastFedAt: R, lastReconciledAt: R, pantry: 25 };
    const r = reconcile(s, R + H);
    expect(r.events).toEqual([{ type: 'auto-fed', at: R, pantryAfter: 0, hungerAfter: 65 }]);
    expect(r.state.lastFedAt).toBe(R);
    expect(r.state.lastReconciledAt).toBe(R + H);
  });

  it('24. alive-at-t* guard', () => {
    // A hand-built inconsistent state: at zero since Z, still flagged alive although lastReconciledAt is past
    // Z + 24 h, and a pantry injected by dev. The auto-feed at t* = from must not fire because the pet is not
    // alive at t*; the pet is reconciled to dead with diedAt = Z + 24 h. (With the rule as written, t* >= from,
    // so the guard can only trigger when from >= death; a state with from < Z + 24 h is the rescue case.)
    const Z = B + 60 * H;
    const s: PetState = {
      ...fresh(),
      hungerAtLastFed: 0,
      lastFedAt: Z,
      lastReconciledAt: Z + 25 * H,
      pantry: 25,
    };
    const r = reconcile(s, Z + 30 * H);
    expect(r.events.filter(autoFed)).toHaveLength(0);
    expect(r.state.alive).toBe(false);
    expect(r.state.diedAt).toBe(Z + 24 * H);
    expect(r.state.pantry).toBe(25);
    // died at Z + 24 h is not inside the half-open window (from, now], so it is not re-emitted here.
    expect(r.events).toEqual([]);
    // The same state with from just before death: died is emitted and no feed fits (t* = from >= ... no: from <
    // death means the rescue feed applies). Sanity-check the boundary: from === death -> no feed, no event.
    const atDeath = reconcile({ ...s, lastReconciledAt: Z + 24 * H }, Z + 30 * H);
    expect(atDeath.events).toEqual([]);
    expect(atDeath.state.alive).toBe(false);
    expect(atDeath.state.pantry).toBe(25);
  });

  it('25. backwards clock', () => {
    const s = reconcile({ ...fresh(), pantry: 100 }, B + 50 * H).state;
    const r = reconcile(s, s.lastReconciledAt - H);
    expect(r.state).toEqual(s);
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
    expect(hungerAt(s, s.lastFedAt - H)).toBe(s.hungerAtLastFed);
  });

  it('26. dead no-op', () => {
    const dead = reconcile(fresh(), B + 84 * H).state;
    const r = reconcile(dead, B + 500 * H);
    expect(r.state).toBe(dead);
    expect(r.events).toEqual([]);
    const ledger = new LocalLedger(1000);
    const d = depositPantry(dead, 100, B + 500 * H, ledger);
    expect(d.moved).toBe(0);
    expect(ledger.balance()).toBe(1000);
  });

  it('reconcile at now === lastReconciledAt applies a feed at from but emits no crossing events', () => {
    const s: PetState = { ...fresh(B, 3), hungerAtLastFed: 30, pantry: 25 };
    const r = reconcile(s, B);
    expect(r.events).toEqual([{ type: 'auto-fed', at: B, pantryAfter: 0, hungerAfter: 75 }]);
    const again = reconcile(r.state, B);
    expect(again.state).toBe(r.state);
    expect(again.events).toEqual([]);
  });
});
