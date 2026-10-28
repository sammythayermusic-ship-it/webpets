import { describe, expect, it } from 'vitest';
import { advanceNeedsTo, hungerDuring, regimeNow, type RegimeSource } from './needsBridge';
import { defaultNeeds, energyAt, needsAt } from '../sim/needs';
import { reconcile } from '../sim/reconcile';
import { B, H, fresh } from '../sim/test-helpers';
import type { SimEvent } from '../sim/types';

const src = (over: Partial<RegimeSource> = {}): RegimeSource => ({
  pet: fresh(),
  dayNight: 'day',
  nightOverride: null,
  present: false,
  hunger: 100,
  ...over,
});

describe('hungerDuring', () => {
  it('reads the anchor before the first auto-feed and the event after it', () => {
    const pet = { ...fresh(), pantry: 100 };
    const r = reconcile(pet, B + 30 * H);
    const fed = r.events.filter((e): e is Extract<SimEvent, { type: 'auto-fed' }> => e.type === 'auto-fed');
    expect(fed.length).toBeGreaterThan(0);
    const first = fed[0]!;
    expect(hungerDuring(pet, r.events, first.at - 1)).toBeCloseTo(30, 0);
    expect(hungerDuring(pet, r.events, first.at)).toBeCloseTo(first.hungerAfter, 9);
    expect(hungerDuring(pet, r.events, first.at + 6 * H)).toBeCloseTo(first.hungerAfter - 25, 6);
  });

  it('is zero once the pet has died, and for a dead pet', () => {
    const pet = { ...fresh(), pantry: 0 };
    const r = reconcile(pet, B + 40 * H);
    expect(r.events.some((e) => e.type === 'died')).toBe(true);
    expect(hungerDuring(pet, r.events, B + 39 * H)).toBe(0);
    expect(hungerDuring({ ...fresh(), alive: false }, [], B)).toBe(0);
  });
});

describe('regimeNow', () => {
  it('derives sleep from the day/night setting and the label from the stored hunger', () => {
    expect(regimeNow(src({ dayNight: 'night' }), B)).toEqual({ asleep: true, hungerLabel: 'full', present: false, personality: fresh().personality });
    expect(regimeNow(src({ dayNight: 'night', pet: { ...fresh(), alive: false } }), B).asleep).toBe(false);
    expect(regimeNow(src({ hunger: 10, present: true }), B)).toMatchObject({ asleep: false, hungerLabel: 'hungry', present: true });
    expect(regimeNow(src({ dayNight: 'day', nightOverride: true }), B).asleep).toBe(true);
  });
});

describe('advanceNeedsTo', () => {
  it('a short span is one segment under the current regime', () => {
    const n = defaultNeeds(B);
    const out = advanceNeedsTo(n, B + 30 * 60_000, src({ dayNight: 'night' }), fresh(), []);
    expect(out.energy.value).toBe(1); // asleep: restoring, already full
    const awake = advanceNeedsTo({ ...n, energy: { value: 0.5, at: B } }, B + 30 * 60_000, src(), fresh(), []);
    expect(awake.energy.value).toBeCloseTo(0.5 - 0.5 / 16, 9);
  });

  it('a long gap is walked by the hour: a night asleep restores energy, a day awake drains it', () => {
    const tired = { ...defaultNeeds(B), energy: { value: 0.2, at: B } };
    const night = advanceNeedsTo(tired, B + 10 * H, src({ dayNight: 'night' }), fresh(), []);
    expect(night.energy.at).toBe(B + 10 * H);
    expect(night.energy.value).toBe(1);
    const day = advanceNeedsTo({ ...defaultNeeds(B) }, B + 10 * H, src({ dayNight: 'day' }), fresh(), []);
    expect(day.energy.value).toBeCloseTo(1 - 10 / 16, 9);
  });

  it('charges the gap to the hunger the pet actually had, using the reconcile events', () => {
    // No pantry: the pet is starving from 24 h on, and starving drains energy twice as fast.
    const pet = { ...fresh(), pantry: 0 };
    const r = reconcile(pet, B + 30 * H);
    const n = defaultNeeds(B);
    const out = advanceNeedsTo(n, B + 30 * H, src({ dayNight: 'day' }), pet, r.events);
    // 16.8 h full/peckish at 1x, 7.2 h hungry at 1.3x, 6 h starving at 2x (walked hourly, labels read at each hour's start).
    expect(out.energy.value).toBe(0); // well past empty either way
    const fedPet = { ...fresh(), pantry: 1000 };
    const r2 = reconcile(fedPet, B + 30 * H);
    const out2 = advanceNeedsTo(n, B + 30 * H, src({ dayNight: 'day' }), fedPet, r2.events);
    // Fed by the pantry every 12 h, never below peckish: 30 h awake at 1x drains 30/16 -> 0 as well, but
    // comfort stays high where the starving pet's collapses.
    expect(needsAt(out2, B + 30 * H, regimeNow(src(), B + 30 * H)).comfort).toBeGreaterThan(
      needsAt(out, B + 30 * H, regimeNow(src({ hunger: 0 }), B + 30 * H)).comfort + 0.3,
    );
  });

  it('nobody is present during a gap, so curiosity builds across it', () => {
    const n = { ...defaultNeeds(B), curiosity: { value: 0, at: B } };
    const out = advanceNeedsTo(n, B + 5 * H, src({ present: true }), fresh(), []);
    expect(out.curiosity.value).toBe(1);
    expect(out.lastSeenAt).toBe(B);
    // And a short span with the pointer there is charged as present.
    const short = advanceNeedsTo(n, B + 10 * 60_000, src({ present: true }), fresh(), []);
    expect(short.lastSeenAt).toBe(B + 10 * 60_000);
    expect(energyAt(short, B + 10 * 60_000, regimeNow(src(), B))).toBeLessThan(1);
  });
});
