import { describe, expect, it } from 'vitest';
import { PURE_DAY, PURE_NIGHT, daylightForHour, isNightAt, mixDaylight, overlayAlphas, resolveDaylight, resolveNight, type Daylight } from './daynight';

const sum = (d: Daylight): number => d.dawn + d.day + d.dusk + d.night;

describe('daylightForHour', () => {
  it('always sums to one and never goes negative', () => {
    for (let h = 0; h < 24; h += 0.05) {
      const d = daylightForHour(h);
      expect(sum(d)).toBeCloseTo(1, 9);
      for (const v of Object.values(d)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('is night at midnight, dawn at half six, day at noon, dusk at six, night by eight', () => {
    expect(daylightForHour(0)).toEqual(PURE_NIGHT);
    expect(daylightForHour(6.5)).toEqual({ dawn: 1, day: 0, dusk: 0, night: 0 });
    expect(daylightForHour(12)).toEqual(PURE_DAY);
    expect(daylightForHour(18)).toEqual({ dawn: 0, day: 0, dusk: 1, night: 0 });
    expect(daylightForHour(20)).toEqual(PURE_NIGHT);
  });

  it('crossfades through the in-between hours in order', () => {
    const six = daylightForHour(6);
    expect(six.night).toBeCloseTo(0.5, 9);
    expect(six.dawn).toBeCloseTo(0.5, 9);
    const seven = daylightForHour(7.25);
    expect(seven.dawn).toBeCloseTo(0.5, 9);
    expect(seven.day).toBeCloseTo(0.5, 9);
    const dusk = daylightForHour(17.25);
    expect(dusk.day).toBeCloseTo(0.5, 9);
    expect(dusk.dusk).toBeCloseTo(0.5, 9);
    const late = daylightForHour(18.75);
    expect(late.dusk).toBeCloseTo(0.5, 9);
    expect(late.night).toBeCloseTo(0.5, 9);
  });

  it('is continuous: no jump larger than a minute of fade anywhere', () => {
    let prev = daylightForHour(0);
    for (let h = 1 / 60; h < 24; h += 1 / 60) {
      const cur = daylightForHour(h);
      for (const k of ['dawn', 'day', 'dusk', 'night'] as const) expect(Math.abs(cur[k] - prev[k])).toBeLessThan(0.05);
      prev = cur;
    }
  });
});

describe('resolve', () => {
  const noon = new Date(2026, 5, 1, 12, 0, 0).getTime();
  const midnight = new Date(2026, 5, 1, 0, 0, 0).getTime();
  it('pinned modes and the override win over the clock', () => {
    expect(resolveDaylight('auto', null, noon)).toEqual(PURE_DAY);
    expect(resolveDaylight('auto', null, midnight)).toEqual(PURE_NIGHT);
    expect(resolveDaylight('night', null, noon)).toEqual(PURE_NIGHT);
    expect(resolveDaylight('day', null, midnight)).toEqual(PURE_DAY);
    expect(resolveDaylight('day', true, noon)).toEqual(PURE_NIGHT);
    expect(resolveDaylight('night', false, midnight)).toEqual(PURE_DAY);
  });

  it('the boolean night is the same curve past its midpoint', () => {
    expect(resolveNight('auto', null, noon)).toBe(false);
    expect(resolveNight('auto', null, midnight)).toBe(true);
    expect(isNightAt(new Date(2026, 5, 1, 19, 0, 0).getTime())).toBe(true); // 19:00 is past the dusk midpoint
    expect(isNightAt(new Date(2026, 5, 1, 18, 30, 0).getTime())).toBe(false);
    expect(isNightAt(new Date(2026, 5, 1, 6, 15, 0).getTime())).toBe(false);
  });
});

describe('overlayAlphas', () => {
  const composite = (w: Daylight): Daylight => {
    // Stack: day base, then dawn, dusk, night overlays with the returned alphas.
    const a = overlayAlphas(w);
    let out: Daylight = { dawn: 0, day: 1, dusk: 0, night: 0 };
    const over = (cur: Daylight, k: keyof Daylight, alpha: number): Daylight => {
      const next: Daylight = { dawn: cur.dawn * (1 - alpha), day: cur.day * (1 - alpha), dusk: cur.dusk * (1 - alpha), night: cur.night * (1 - alpha) };
      next[k] += alpha;
      return next;
    };
    out = over(out, 'dawn', a.dawn);
    out = over(out, 'dusk', a.dusk);
    out = over(out, 'night', a.night);
    return out;
  };

  it('reproduces the weights exactly at every hour', () => {
    for (let h = 0; h < 24; h += 0.1) {
      const w = daylightForHour(h);
      const c = composite(w);
      for (const k of ['dawn', 'day', 'dusk', 'night'] as const) expect(c[k]).toBeCloseTo(w[k], 9);
    }
  });

  it('a dusk-to-night midpoint shows no day at all', () => {
    const c = composite({ dawn: 0, day: 0, dusk: 0.5, night: 0.5 });
    expect(c.day).toBeCloseTo(0, 9);
    expect(c.dusk).toBeCloseTo(0.5, 9);
    expect(c.night).toBeCloseTo(0.5, 9);
  });

  it('mixDaylight eases between two sets', () => {
    const m = mixDaylight(PURE_DAY, PURE_NIGHT, 0.25);
    expect(m).toEqual({ dawn: 0, day: 0.75, dusk: 0, night: 0.25 });
  });
});
