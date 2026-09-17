import type { HungerLabel, PetState, SimConstants } from './types';
import { DEFAULT_CONSTANTS, HOUR_MS } from './constants';
import { deathFromZero, hungerFrom, zeroFrom } from './math';
import { reconcile } from './reconcile';

/** Hunger in [0, MAX_HUNGER] at `now`. 0 for dead pets. Never above hungerAtLastFed (backwards clock). */
export function hungerAt(state: PetState, now: number, c: SimConstants = DEFAULT_CONSTANTS): number {
  if (!state.alive) return 0;
  return hungerFrom(state.hungerAtLastFed, state.lastFedAt, now, c);
}

/** full if h > 60; peckish if 30 < h <= 60; hungry if 0 < h <= 30; starving if h === 0. */
export function hungerLabel(h: number): HungerLabel {
  if (h > 60) return 'full';
  if (h > 30) return 'peckish';
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
 * Dead: diedAt. Alive: simulate auto-feeds from `now` until the pantry can no longer pay, then zeroAt + 24 h.
 * Always a number (the pantry is finite).
 */
export function projectedDeathAt(state: PetState, now: number, c: SimConstants = DEFAULT_CONSTANTS): number {
  if (!state.alive) return state.diedAt ?? now;
  const upToNow = reconcile(state, Math.max(now, state.lastReconciledAt), c).state;
  if (!upToNow.alive) return upToNow.diedAt ?? now;
  const end = reconcile(upToNow, Number.MAX_SAFE_INTEGER, c).state;
  if (end.diedAt !== undefined) return end.diedAt;
  // Unreachable with a positive FEED_COST; fall back to the pantry-less projection.
  return deathFromZero(zeroAt(upToNow, c), c);
}

/** Days of runway the pantry buys: (pantry / FEED_COST) * (FEED_GAIN / DECAY_PER_HOUR) / 24. */
export function pantryDays(pantry: number, c: SimConstants = DEFAULT_CONSTANTS): number {
  if (!(pantry > 0)) return 0;
  return ((pantry / c.FEED_COST) * (c.FEED_GAIN / c.DECAY_PER_HOUR)) / 24;
}
