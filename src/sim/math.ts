// Internal hunger math shared by hunger.ts and reconcile.ts. Timestamps are always rounded to integer ms so
// that reconcile is path independent regardless of float noise in the constants.
import type { SimConstants } from './types';
import { HOUR_MS } from './constants';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Hunger at `now` given the anchor (hungerAtLastFed, lastFedAt). Never above the anchor (backwards clock). */
export function hungerFrom(hungerAtLastFed: number, lastFedAt: number, now: number, c: SimConstants): number {
  const hours = Math.max(0, now - lastFedAt) / HOUR_MS;
  return clamp(hungerAtLastFed - c.DECAY_PER_HOUR * hours, 0, c.MAX_HUNGER);
}

/** Time at which hunger reaches 0 (integer ms). */
export function zeroFrom(hungerAtLastFed: number, lastFedAt: number, c: SimConstants): number {
  return Math.round(lastFedAt + (hungerAtLastFed / c.DECAY_PER_HOUR) * HOUR_MS);
}

/** Time at which hunger reaches PANTRY_TRIGGER (integer ms; in the past when the anchor is already below it). */
export function crossingFrom(hungerAtLastFed: number, lastFedAt: number, c: SimConstants): number {
  return Math.round(lastFedAt + ((hungerAtLastFed - c.PANTRY_TRIGGER) / c.DECAY_PER_HOUR) * HOUR_MS);
}

export function deathFromZero(zero: number, c: SimConstants): number {
  return Math.round(zero + c.DEATH_AFTER_ZERO_HOURS * HOUR_MS);
}
