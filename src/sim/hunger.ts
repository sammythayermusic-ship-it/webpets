import type { HungerLabel, PetState, SimConstants } from './types';
import { DEFAULT_CONSTANTS, FULL_ABOVE, HOUR_MS } from './constants';
import { deathFromZero, hungerFrom, zeroFrom } from './math';
import { reconcile } from './reconcile';

/** Hunger in [0, MAX_HUNGER] at `now`. 0 for dead pets. Never above hungerAtLastFed (backwards clock). */
export function hungerAt(state: PetState, now: number, c: SimConstants = DEFAULT_CONSTANTS): number {
  if (!state.alive) return 0;
  return hungerFrom(state.hungerAtLastFed, state.lastFedAt, now, c);
}

/**
 * full above FULL_ABOVE; peckish down to PANTRY_TRIGGER; hungry down to 0; starving at 0.
 *
 * `src/ui/model.ts` carries a second copy of this on purpose, so the ui module never imports the sim.
 * Both now read the same two named boundaries, and `labelSync.test.ts` walks the whole range asserting
 * they agree -- deliberate duplication is only safe while something holds the copies together.
 */
export function hungerLabel(h: number): HungerLabel {
  if (h > FULL_ABOVE) return 'full';
  if (h > DEFAULT_CONSTANTS.PANTRY_TRIGGER) return 'peckish';
  if (h > 0) return 'hungry';
  return 'starving';
}

/** When hunger reaches 0 ignoring the pantry. Dead: diedAt - DEATH_AFTER_ZERO_HOURS. Always a number. */
export function zeroAt(state: PetState, c: SimConstants = DEFAULT_CONSTANTS): number {
  if (!state.alive) {
    const died = state.diedAt ?? state.lastReconciledAt;
    return Math.round(died - c.DEATH_AFTER_ZERO_HOURS * HOUR_MS);
  }
  return zeroFrom(state.hungerAtLastFed, state.lastFedAt, c);
}

/**
 * Dead: diedAt. Alive: simulate auto-feeds from `now` until the feeder holds less than a meal, then zeroAt +
 * DEATH_AFTER_ZERO_HOURS. Always a number (the feeder is finite).
 */
export function projectedDeathAt(state: PetState, now: number, c: SimConstants = DEFAULT_CONSTANTS): number {
  if (!state.alive) return state.diedAt ?? now;
  const upToNow = reconcile(state, Math.max(now, state.lastReconciledAt), c).state;
  if (!upToNow.alive) return upToNow.diedAt ?? now;
  const end = reconcile(upToNow, Number.MAX_SAFE_INTEGER, c).state;
  if (end.diedAt !== undefined) return end.diedAt;
  // Unreachable with a positive MEAL_SIZE; fall back to the pantry-less projection.
  return deathFromZero(zeroAt(upToNow, c), c);
}

/** Days of food in the feeder: (pantry / MEAL_SIZE) * (FEED_GAIN / DECAY_PER_HOUR) / 24. */
export function pantryDays(pantry: number, c: SimConstants = DEFAULT_CONSTANTS): number {
  if (!(pantry > 0)) return 0;
  return ((pantry / c.MEAL_SIZE) * (c.FEED_GAIN / c.DECAY_PER_HOUR)) / 24;
}
