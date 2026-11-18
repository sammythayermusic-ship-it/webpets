import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';
import { feed } from './feed';
import { HEN_AGE_DAYS } from './chicken';
import { B, H, fresh } from './test-helpers';
import type { PetState, SimEvent } from './types';

const D = 24 * H;
/** A chick born at B with a feeder deep enough that hunger never comes into it. */
const chick = (pantry = 100_000): PetState => ({ ...fresh(), species: 'chicken', habitat: 'brooder', pantry });
const eggs = (ev: readonly SimEvent[]): number[] => ev.filter((e) => e.type === 'egg').map((e) => e.at);

describe('the chicken (PHASE-NEXT Step 5)', () => {
  it('stays a chick in the brooder for its first seven days, and lays nothing', () => {
    const r = reconcile(chick(), B + 7 * D - 1);
    expect(r.state.habitat).toBe('brooder');
    expect(r.events.some((e) => e.type === 'migrated' || e.type === 'egg')).toBe(false);
    expect(r.state.speciesData['eggs'] ?? 0).toBe(0);
  });

  it('moves to the coop at exactly seven days old, once', () => {
    expect(HEN_AGE_DAYS).toBe(7);
    const r = reconcile(chick(), B + 7 * D);
    expect(r.state.habitat).toBe('coop');
    expect(r.events.filter((e) => e.type === 'migrated')).toEqual([{ type: 'migrated', at: B + 7 * D, to: 'coop' }]);
    const again = reconcile(r.state, B + 9 * D);
    expect(again.events.some((e) => e.type === 'migrated')).toBe(false);
  });

  it('lays one egg at the end of each day as a hen, the first on its eighth birthday', () => {
    const r = reconcile(chick(), B + 10 * D);
    expect(eggs(r.events)).toEqual([B + 8 * D, B + 9 * D, B + 10 * D]);
    expect(r.state.speciesData['eggs']).toBe(3);
    // the events are in order with everything else that happened
    const at = r.events.map((e) => e.at);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('lays the same eggs however the time is cut up, and none twice', () => {
    let s = chick();
    const seen: number[] = [];
    for (let t = B; t <= B + 12 * D; t += 5 * H + 17 * 60_000) {
      const r = reconcile(s, t);
      seen.push(...eggs(r.events));
      s = r.state;
    }
    const last = reconcile(s, B + 12 * D);
    seen.push(...eggs(last.events));
    expect(seen).toEqual([8, 9, 10, 11, 12].map((d) => B + d * D));
    expect(last.state.speciesData['eggs']).toBe(5);
    expect(reconcile(last.state, B + 12 * D).events).toEqual([]);
  });

  it('lays nothing for a day in which its hunger reached zero, and lays again the day after', () => {
    // A hen with an empty feeder, fed by hand to full at the start of day 8: empty 24 h later, at
    // the first instant of day 9. Fed again six hours into day 9, and kept fed from then on.
    let s: PetState = reconcile(chick(), B + 8 * D).state;
    s = { ...s, pantry: 0 };
    const f1 = feed({ ...s, hungerAtLastFed: 50, lastFedAt: B + 8 * D }, B + 8 * D);
    expect(f1.ok).toBe(true);
    s = f1.state;
    const r1 = reconcile(s, B + 9 * D + 6 * H);
    expect(r1.events.some((e) => e.type === 'starving')).toBe(true);
    // day 8 itself was fine: its egg is laid at its end
    expect(eggs(r1.events)).toEqual([B + 9 * D]);
    const f2 = feed(r1.state, B + 9 * D + 6 * H);
    s = { ...f2.state, pantry: 100_000 };
    const r2 = reconcile(s, B + 11 * D);
    // day 9 had the empty stretch: no egg at its end. Day 10 was fed throughout.
    expect(eggs(r2.events)).toEqual([B + 11 * D]);
  });

  it('a hen that dies lays nothing after', () => {
    const s = { ...reconcile(chick(), B + 8 * D).state, pantry: 0 };
    const r = reconcile(s, B + 20 * D);
    expect(r.state.alive).toBe(false);
    const died = r.events.find((e) => e.type === 'died');
    expect(died).toBeDefined();
    for (const at of eggs(r.events)) expect(at).toBeLessThanOrEqual(died!.at);
    expect(reconcile(r.state, B + 30 * D).events).toEqual([]);
  });

  it('is the chicken\'s rule only: other species lay nothing and stay home', () => {
    const fish = reconcile({ ...fresh(), pantry: 100_000 }, B + 12 * D);
    expect(fish.state.habitat).toBe('bowl');
    expect(fish.state.speciesData).toEqual({});
    expect(fish.events.every((e) => e.type === 'auto-fed')).toBe(true);
  });
});
