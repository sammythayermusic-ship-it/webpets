import { describe, expect, it } from 'vitest';
import { feed, fillPantry } from './feed';
import { hungerAt, pantryDays } from './hunger';
import { reconcile } from './reconcile';
import { DEFAULT_CONSTANTS, PANTRY_CAPACITY, PANTRY_LOW_DAYS } from './constants';
import { B, H, fresh, mulberry32 } from './test-helpers';
import type { PetState, SimEvent } from './types';

const autoFed = (e: SimEvent): e is Extract<SimEvent, { type: 'auto-fed' }> => e.type === 'auto-fed';

// The pantry is the habitat's holiday feeder. Food is free: one action fills it to three days of
// meals, and it feeds the pet on its own whenever hunger reaches the trigger.
describe('the holiday feeder (pantry)', () => {
  it('27. fillPantry fills the feeder to three days of food, for free, and changes nothing else', () => {
    expect(PANTRY_CAPACITY).toBe(150);
    expect(PANTRY_CAPACITY % DEFAULT_CONSTANTS.MEAL_SIZE).toBe(0);
    expect(pantryDays(PANTRY_CAPACITY)).toBeCloseTo(3, 9);
    expect(PANTRY_LOW_DAYS).toBe(1);
    expect(PANTRY_LOW_DAYS).toBeLessThan(pantryDays(PANTRY_CAPACITY));

    const s = fresh();
    const f = fillPantry(s, B + H);
    expect(f.state.pantry).toBe(PANTRY_CAPACITY);
    expect(f.events).toEqual([]);
    expect(f.state.meals).toBe(0);
    expect(f.state.foodEaten).toBe(0);
    expect(f.state.lastFedAt).toBe(B);
    expect(f.state.lastReconciledAt).toBe(B + H);
    expect(f.state.alive).toBe(true);
    // Filling a full feeder again is harmless.
    const again = fillPantry(f.state, B + 2 * H);
    expect(again.state.pantry).toBe(PANTRY_CAPACITY);
    expect(again.events).toEqual([]);
  });

  it('28. a full feeder carries a fresh pet through three days away', () => {
    const full = fillPantry(fresh(), B).state;
    // Six meals: the first on the hungry crossing at 16.8 h, then one every twelve hours.
    const away = reconcile(full, B + 72 * H);
    expect(away.state.alive).toBe(true);
    expect(away.events.every(autoFed)).toBe(true);
    expect(away.events.map((e) => e.at)).toEqual([16.8, 28.8, 40.8, 52.8, 64.8].map((h) => B + Math.round(h * H)));
    expect(away.state.pantry).toBe(25);
    expect(hungerAt(away.state, B + 72 * H)).toBeCloseTo(50, 6);
    // The last meal lands at 76.8 h; after that it is the ordinary clock: hungry 12 h later, empty 19.2 h
    // later, dead 12 h after that.
    const gone = reconcile(away.state, B + 108 * H);
    expect(gone.events.map((e) => e.type)).toEqual(['auto-fed', 'hungry', 'starving', 'dying-soon', 'died']);
    expect(gone.events.map((e) => e.at)).toEqual([76.8, 88.8, 96, 102, 108].map((h) => B + Math.round(h * H)));
    expect(gone.state.pantry).toBe(0);
    expect(gone.state.meals).toBe(6);
    expect(gone.state.foodEaten).toBe(6 * DEFAULT_CONSTANTS.MEAL_SIZE);
  });

  it('29. fillPantry with a backwards clock fills at the pet\'s own time, and a dead pet is left alone', () => {
    // Skipped to 20 h (hungry), then the clock moves back to B: the fill acts at lastReconciledAt, so the
    // hungry pet is fed at once rather than at a moment it has already lived through.
    const skipped = reconcile(fresh(), B + 20 * H).state;
    const f = fillPantry(skipped, B);
    expect(f.events).toHaveLength(1);
    const e = f.events[0];
    expect(e && autoFed(e) && e.at).toBe(B + 20 * H);
    expect(f.state.pantry).toBe(PANTRY_CAPACITY - DEFAULT_CONSTANTS.MEAL_SIZE);
    expect(f.state.lastReconciledAt).toBe(B + 20 * H);

    const dead = reconcile(fresh(), B + 36 * H).state;
    expect(dead.alive).toBe(false);
    const d = fillPantry(dead, B + 40 * H);
    expect(d.state).toBe(dead);
    expect(d.events).toEqual([]);
    // A pet that dies during the catch-up reconcile is not filled either.
    const dying = fillPantry(fresh(), B + 40 * H);
    expect(dying.state.alive).toBe(false);
    expect(dying.state.pantry).toBe(0);
    expect(dying.events.map((x) => x.type)).toEqual(['hungry', 'starving', 'dying-soon', 'died']);
  });

  it('30. invariants over 500 random ops: free meals, a bounded feeder, whole numbers', () => {
    const rng = mulberry32(42);
    let s: PetState = fresh();
    let now = B;
    const check = () => {
      expect(s.foodEaten).toBe(s.meals * DEFAULT_CONSTANTS.MEAL_SIZE);
      expect(s.pantry).toBeLessThanOrEqual(PANTRY_CAPACITY);
      for (const v of [s.pantry, s.foodEaten, s.meals]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(s.lastReconciledAt).toBeGreaterThanOrEqual(s.lastFedAt);
    };
    for (let i = 0; i < 500; i++) {
      now += Math.floor(rng() * 20 * H);
      const op = rng();
      // A pet that died is replaced now and then, so the walk keeps exercising a living one.
      if (!s.alive && op < 0.1) {
        s = fresh(now, i + 2);
      } else if (op < 0.35) {
        const r = feed(s, now);
        // Feeding only ever fails because the pet is dead; there is nothing to run out of.
        expect(r.ok).toBe(r.state.alive);
        s = r.state;
      } else if (op < 0.6) {
        s = fillPantry(s, now).state;
      } else {
        s = reconcile(s, now).state;
      }
      check();
    }
  });
});
