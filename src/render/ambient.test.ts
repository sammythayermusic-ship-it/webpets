import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WHEEL_RUN_OMEGA, lightTint, moteLight, mothPresence, snailCrawlHours, snailPose, wheelFrame, wheelStep, type WheelState } from './ambient';
import { WHEEL_KM_FULL_PACE } from './scene';
import { WHEEL_KM_PER_TICK } from '../species/hamster/behavior';
import { easeLight } from './layers';
import { PURE_DAY, PURE_NIGHT, daylightForHour } from '../sim/daylight';
import { parseManifest } from './manifest';

const HOUR = 3_600_000;

describe('the wheel', () => {
  const run = (s: WheelState, drive: number, seconds: number): WheelState => {
    let st = s;
    for (let i = 0; i < seconds * 60; i += 1) st = wheelStep(st, drive, 1 / 60);
    return st;
  };

  it('gets up to running pace in about a second', () => {
    const s = run({ angle: 0, omega: 0 }, 1, 1.2);
    expect(s.omega).toBeGreaterThan(WHEEL_RUN_OMEGA * 0.9);
    expect(s.omega).toBeLessThanOrEqual(WHEEL_RUN_OMEGA);
  });

  it('coasts down after the hamster hops off, and stops, without ever turning back', () => {
    let s = run({ angle: 0, omega: 0 }, 1, 2);
    const omegas: number[] = [];
    for (let i = 0; i < 12 * 60; i += 1) {
      s = wheelStep(s, 0, 1 / 60);
      omegas.push(s.omega);
    }
    // still turning a second later: it coasts, it does not stop dead
    expect(omegas[60]).toBeGreaterThan(1);
    expect(omegas.at(-1)).toBe(0);
    expect(omegas.every((o) => o >= 0)).toBe(true);
    for (let i = 1; i < omegas.length; i += 1) expect(omegas[i] as number).toBeLessThanOrEqual(omegas[i - 1] as number);
  });

  it('never turns so fast a rung moves half its spacing in one 60 fps frame (it would look backwards)', () => {
    const s = run({ angle: 0, omega: 0 }, 1.3, 5);
    expect((s.omega / 60) / ((2 * Math.PI) / 22)).toBeLessThan(0.5);
  });

  it('shows every frame of the loop, in order, and wraps', () => {
    const loop = (2 * Math.PI) / 22;
    const seen = new Set<number>();
    let last = -1;
    for (let i = 0; i < 160; i += 1) {
      const f = wheelFrame((loop * i) / 80, loop, 8);
      if (f !== last) seen.add(f);
      last = f;
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(wheelFrame(loop * 3 + 1e-9, loop, 8)).toBe(0);
    expect(wheelFrame(-loop / 16, loop, 8)).toBe(7);
  });

  it('reads the hamster\'s pace off the same distance per tick the behaviour counts', () => {
    expect(WHEEL_KM_FULL_PACE).toBe(WHEEL_KM_PER_TICK);
  });
});

describe('the snail', () => {
  const path = { cx: 160, cy: 114.5, rx: 49.2, ry: 13 };

  it('crawls about an inch an hour (19 grid px at the bowl\'s 1.34 mm a px)', () => {
    // Measure over a whole number of half-hour cycles, so rests are counted fairly.
    const t0 = 1_793_850_000_000;
    let dist = 0;
    let prev = snailPose(t0, path);
    for (let s = 60; s <= 6 * 3600; s += 60) {
      const p = snailPose(t0 + s * 1000, path);
      dist += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
    const perHour = dist / 6;
    expect(perHour).toBeGreaterThan(19 * 0.6);
    expect(perHour).toBeLessThan(19 * 1.6);
  });

  it('rests twelve minutes of every half hour, and does not move while it rests', () => {
    const t = Math.floor(1_793_850_000_000 / (HOUR / 2)) * (HOUR / 2);
    const resting = snailPose(t + 20 * 60_000, path);
    const later = snailPose(t + 28 * 60_000, path);
    expect(resting.crawling).toBe(false);
    expect(later.x).toBeCloseTo(resting.x, 6);
    expect(later.y).toBeCloseTo(resting.y, 6);
    expect(snailPose(t + 5 * 60_000, path).crawling).toBe(true);
    expect(snailCrawlHours(t + HOUR) - snailCrawlHours(t)).toBeCloseTo(0.6, 9);
  });

  it('is where the clock says, after a night away: a function of the time and nothing else', () => {
    const t = 1_793_900_000_000;
    expect(snailPose(t, path)).toEqual(snailPose(t, path));
    // and it stays on its loop on the glass, gently tilted
    for (let h = 0; h < 30; h += 0.37) {
      const p = snailPose(t + h * HOUR, path);
      expect(Math.abs(p.x - path.cx)).toBeLessThanOrEqual(path.rx + 1e-6);
      expect(Math.abs(p.y - path.cy)).toBeLessThanOrEqual(path.ry + 1e-6);
      expect(Math.abs(p.tilt)).toBeLessThanOrEqual(0.6);
    }
  });
});

describe('the moth and the dust', () => {
  it('the moth is out at night and nowhere by day, dawn or dusk', () => {
    expect(mothPresence(PURE_NIGHT)).toBe(1);
    expect(mothPresence(PURE_DAY)).toBe(0);
    expect(mothPresence(daylightForHour(6.5))).toBe(0);
    expect(mothPresence(daylightForHour(18))).toBe(0);
  });

  it('a mote shows only where a beam crosses it: the day key, or the light bar at night', () => {
    const air = { x: 26, y: 30, w: 238, h: 80 };
    const hood: [[number, number], [number, number]] = [[102, 36.6], [238.8, 36.6]];
    // in the day beam (upper left, slanting down to the right) vs far out of it
    expect(moteLight(air.x + 0.18 * air.w + 18, air.y + 30, PURE_DAY, air, hood)).toBeGreaterThan(0.5);
    expect(moteLight(air.x + air.w - 5, air.y + 5, PURE_DAY, air, hood)).toBeLessThan(0.1);
    // at night: under the bar yes, off to the side of it no
    expect(moteLight(170, 50, PURE_NIGHT, air, hood)).toBeGreaterThan(0.5);
    expect(moteLight(40, 50, PURE_NIGHT, air, hood)).toBe(0);
  });

  it('things drawn in code are untinted by day and take the measured colour of the other lights', () => {
    const t = { dawn: [0.82, 0.79, 0.74], dusk: [0.63, 0.52, 0.43], night: [0.53, 0.58, 0.61] } as const;
    const tints = { dawn: [...t.dawn], dusk: [...t.dusk], night: [...t.night] } as { dawn: [number, number, number]; dusk: [number, number, number]; night: [number, number, number] };
    expect(lightTint(PURE_DAY, tints)).toBe(0xffffff);
    expect(lightTint(PURE_NIGHT, tints)).toBe((Math.round(0.53 * 255) << 16) | (Math.round(0.58 * 255) << 8) | Math.round(0.61 * 255));
  });
});

describe('time of day as light', () => {
  it('eases toward a new light over about two seconds, the four weights always summing to one', () => {
    let l = PURE_DAY;
    for (let i = 0; i < 60; i += 1) {
      l = easeLight(l, PURE_NIGHT, 16.7);
      expect(l.dawn + l.day + l.dusk + l.night).toBeCloseTo(1, 9);
    }
    expect(l.night).toBeGreaterThan(0.75);
    for (let i = 0; i < 260; i += 1) l = easeLight(l, PURE_NIGHT, 16.7);
    expect(l).toEqual(PURE_NIGHT);
    // nothing to do: the same object back, so the stack can skip the repaint
    expect(easeLight(PURE_NIGHT, PURE_NIGHT, 16.7)).toBe(PURE_NIGHT);
  });
});

describe('the checked-in manifest (Step 3)', () => {
  const root = new URL('../../assets/', import.meta.url);
  const m = parseManifest(JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as unknown);

  it('every habitat has all four light sets on the art that has a light, and every file exists', () => {
    for (const [key, h] of Object.entries(m.habitats)) {
      for (const l of h.layers) {
        if (!['bg', 'decor_front', 'glass'].includes(l.name) || l.file === undefined) continue;
        for (const v of [l.night, l.dawn, l.dusk]) {
          expect(v, `${key} ${l.name} has a variant`).toBeDefined();
          expect(existsSync(new URL(v as string, root)), `${v}`).toBe(true);
        }
      }
    }
  });

  it('every ambient file exists, and the hamster homes have a wheel, a bottle, a light and a moth; the bowl a snail', () => {
    for (const [key, h] of Object.entries(m.habitats)) {
      const a = h.ambient;
      expect(a, key).toBeDefined();
      for (const f of [...(a?.wheel?.frames ?? []), ...(a?.critter?.frames ?? [])]) expect(existsSync(new URL(f, root)), f).toBe(true);
      if (key.startsWith('hamster/')) {
        expect(a?.wheel?.frames.length).toBeGreaterThanOrEqual(8);
        expect(a?.bottle).toBeDefined();
        expect(a?.hood).toBeDefined();
        expect(a?.critter?.kind).toBe('moth');
      } else {
        expect(a?.critter?.kind).toBe('snail');
        expect(h.live?.plants && existsSync(new URL(h.live.plants, root))).toBe(true);
      }
    }
  });

  it('the wheel is drawn where it was cut from, and its hub is inside it', () => {
    for (const h of Object.values(m.habitats)) {
      const w = h.ambient?.wheel;
      if (!w) continue;
      expect(w.hub[0]).toBeGreaterThan(w.rect.x);
      expect(w.hub[0]).toBeLessThan(w.rect.x + w.rect.w);
      expect(w.hub[1]).toBeGreaterThan(w.rect.y);
      expect(w.hub[1]).toBeLessThan(w.rect.y + w.rect.h);
    }
  });
});
