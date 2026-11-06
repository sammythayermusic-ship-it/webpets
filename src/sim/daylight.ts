// Time of day as light: four weights (dawn, day, dusk, night) that sum to one, and the arithmetic on
// them. Pure: no clock, no settings. `src/app/daynight.ts` reads the local hour and the settings and
// hands the result to the renderer, which crossfades the plate sets by exactly these numbers.

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
