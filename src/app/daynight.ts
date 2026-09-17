import type { DayNightMode } from './types';

/** Local hour < 7 or >= 19 counts as night (no location lookup in Phase 0). */
export function isNightAt(now: number): boolean {
  const hour = new Date(now).getHours();
  return hour < 7 || hour >= 19;
}

/** settings.dayNight + local time, overridden by the dev panel's nightOverride. */
export function resolveNight(mode: DayNightMode, nightOverride: boolean | null, now: number): boolean {
  if (nightOverride !== null) return nightOverride;
  return mode === 'night' || (mode === 'auto' && isNightAt(now));
}
