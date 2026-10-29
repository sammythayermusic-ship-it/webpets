// Time of day, as light. Pure functions of the clock and the settings; no DOM.
//
// Night used to be a boolean and a tint. The habitat now ships four plate sets — dawn, day, dusk and
// night — rendered under rigs whose key light actually moves, so "what time is it" has to be a blend
// of four weights rather than a switch. `daylightAt` reads the local hour and returns weights that
// sum to one, crossfading over the hours a real sky does; `resolveDaylight` folds in the setting
// (auto / pinned day / pinned night) and the dev panel's override. `resolveNight` is the boolean the
// sim still needs (a pet sleeps at night, not at dusk), read off the same curve.

import type { DayNightMode } from './types';

/** Weights of the four light sets, each 0..1, summing to 1. */
export interface Daylight {
  dawn: number;
  day: number;
  dusk: number;
  night: number;
}

export const PURE_DAY: Daylight = { dawn: 0, day: 1, dusk: 0, night: 0 };
export const PURE_NIGHT: Daylight = { dawn: 0, day: 0, dusk: 0, night: 1 };

/**
 * The hours each set peaks and the edges it fades across (local time, decimal hours). Dawn is a
 * short window around sunrise, dusk around sunset; night is everything after dark. No location
 * lookup: a fixed temperate-latitude day, like the old 19:00–07:00 night it replaces.
 */
const NIGHT_END = 5.5; // night starts fading
const DAWN_PEAK = 6.5;
const DAY_START = 8.0; // dawn fully gone
const DAY_END = 16.5; // dusk starts
const DUSK_PEAK = 18.0;
const NIGHT_START = 19.5; // dusk fully gone

function ramp(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return (t - a) / (b - a);
}

/** Local decimal hour of `now` (0..24). */
export function localHour(now: number): number {
  const d = new Date(now);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Light weights for a local decimal hour. */
export function daylightForHour(h: number): Daylight {
  let dawn = 0;
  let day = 0;
  let dusk = 0;
  let night = 0;
  if (h < NIGHT_END || h >= NIGHT_START) {
    night = 1;
  } else if (h < DAWN_PEAK) {
    dawn = ramp(h, NIGHT_END, DAWN_PEAK);
    night = 1 - dawn;
  } else if (h < DAY_START) {
    day = ramp(h, DAWN_PEAK, DAY_START);
    dawn = 1 - day;
  } else if (h < DAY_END) {
    day = 1;
  } else if (h < DUSK_PEAK) {
    dusk = ramp(h, DAY_END, DUSK_PEAK);
    day = 1 - dusk;
  } else {
    night = ramp(h, DUSK_PEAK, NIGHT_START);
    dusk = 1 - night;
  }
  return { dawn, day, dusk, night };
}

export function daylightAt(now: number): Daylight {
  return daylightForHour(localHour(now));
}

/** settings.dayNight + local time, overridden by the dev panel's nightOverride. */
export function resolveDaylight(mode: DayNightMode, nightOverride: boolean | null, now: number): Daylight {
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
export function resolveNight(mode: DayNightMode, nightOverride: boolean | null, now: number): boolean {
  return resolveDaylight(mode, nightOverride, now).night > 0.5;
}

/**
 * Alphas for the variant sprites stacked over the day sprite, in the order dawn, dusk, night, such
 * that the composite equals the weighted blend EXACTLY.
 *
 * Stacking sprites with alpha = weight does not: with dusk 0.5 over day and night 0.5 over that, a
 * quarter of day shows through in the middle of a dusk-to-night fade. Each overlay's alpha is its
 * weight divided by the weight of everything at or below it, which is what makes the layers above
 * see only what they should.
 */
export function overlayAlphas(w: Daylight): { dawn: number; dusk: number; night: number } {
  const safe = (n: number, d: number): number => (d <= 1e-9 ? 0 : Math.min(1, Math.max(0, n / d)));
  const upToDawn = w.day + w.dawn;
  const upToDusk = upToDawn + w.dusk;
  const total = upToDusk + w.night;
  return { dawn: safe(w.dawn, upToDawn), dusk: safe(w.dusk, upToDusk), night: safe(w.night, total) };
}

/** Linear blend of two weight sets, for easing a change over time. */
export function mixDaylight(a: Daylight, b: Daylight, t: number): Daylight {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    dawn: a.dawn + (b.dawn - a.dawn) * k,
    day: a.day + (b.day - a.day) * k,
    dusk: a.dusk + (b.dusk - a.dusk) * k,
    night: a.night + (b.night - a.night) * k,
  };
}

export function sameDaylight(a: Daylight, b: Daylight): boolean {
  return a.dawn === b.dawn && a.day === b.day && a.dusk === b.dusk && a.night === b.night;
}
