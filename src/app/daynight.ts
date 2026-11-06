// Time of day, as light. Pure functions of the clock and the settings; no DOM.
//
// Night used to be a boolean and a tint. The habitat now ships four plate sets — dawn, day, dusk and
// night — rendered under rigs whose key light actually moves, so "what time is it" has to be a blend
// of four weights rather than a switch. `daylightAt` reads the local hour and returns weights that
// sum to one, crossfading over the hours a real sky does; `resolveDaylight` folds in the setting
// (auto / pinned day / pinned night) and the dev panel's override. `resolveNight` is the boolean the
// sim still needs (a pet sleeps at night, not at dusk), read off the same curve.

import type { DayNightMode } from './types';
import { PURE_DAY, PURE_NIGHT, daylightForHour, type Daylight } from '../sim/daylight';

export { PURE_DAY, PURE_NIGHT, daylightForHour, mixDaylight, overlayAlphas, sameDaylight } from '../sim/daylight';
export type { Daylight } from '../sim/daylight';

/** Local decimal hour of `now` (0..24). */
export function localHour(now: number): number {
  const d = new Date(now);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

export function daylightAt(now: number): Daylight {
  return daylightForHour(localHour(now));
}

/**
 * The dev panel's and the harness's override of the light: `true` pins night, `false` pins day, a
 * number pins the local clock HOUR (0..24, so 7 is early morning and 18.5 dusk) and lets everything
 * else follow from it as it would at that hour, and `null` follows the settings and the real clock.
 */
export type LightOverride = boolean | number | null;

/** settings.dayNight + local time, overridden by the dev panel's override (see LightOverride). */
export function resolveDaylight(mode: DayNightMode, nightOverride: LightOverride, now: number): Daylight {
  if (typeof nightOverride === 'number') return daylightForHour(((nightOverride % 24) + 24) % 24);
  if (nightOverride !== null) return nightOverride ? PURE_NIGHT : PURE_DAY;
  if (mode === 'night') return PURE_NIGHT;
  if (mode === 'day') return PURE_DAY;
  return daylightAt(now);
}

/** Local hour < 7 or >= 19 counted as night before; now: the night set carries more than half the light. */
export function isNightAt(now: number): boolean {
  return daylightAt(now).night > 0.5;
}

/** The boolean the simulation sleeps by, read off the same curve as the light. */
export function resolveNight(mode: DayNightMode, nightOverride: LightOverride, now: number): boolean {
  return resolveDaylight(mode, nightOverride, now).night > 0.5;
}

