import { describe, expect, it } from 'vitest';
import { BOND, bondEvent, bondLevel, bondNow, bondPerks, emptyBond, normalizeBond, type Bond, type BondEvent } from './bond';

const T0 = new Date(2026, 10, 2, 9, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** A caring day: two meals, a few visits, a little chat. */
function careDay(b: Bond, start: number): Bond {
  const evs: [number, BondEvent][] = [
    [1, 'visit'], [1.1, 'fed'], [1.2, 'chat'], [1.3, 'chat'], [5, 'visit'], [9, 'visit'], [9.1, 'fed'], [9.2, 'chat'],
  ];
  for (const [h, e] of evs) b = bondEvent(b, e, start + h * HOUR, dayKey(start + h * HOUR));
  return b;
}

describe('the bond', () => {
  it('starts at nothing, as people who just met', () => {
    const b = emptyBond(T0);
    expect(b.points).toBe(0);
    expect(bondLevel(b.points)).toBe(0);
  });

  it('grows with daily care, but a single day can only add so much', () => {
    let b = emptyBond(T0);
    for (let i = 0; i < 50; i++) b = bondEvent(b, 'chat', T0 + i * 1000, dayKey(T0));
    expect(b.points).toBe(BOND.DAILY_GAIN_CAP);
    b = bondEvent(b, 'fed', T0 + DAY, dayKey(T0 + DAY));
    expect(b.points).toBe(BOND.DAILY_GAIN_CAP + BOND.GAIN.fed);
  });

  it('takes a couple of days to warm up, a week or so to be good friends, a few weeks to be best friends', () => {
    let b = emptyBond(T0);
    const levelOnDay: number[] = [];
    for (let d = 0; d < 30; d++) {
      b = careDay(b, T0 + d * DAY);
      levelOnDay.push(bondLevel(b.points));
    }
    const firstDay = (lvl: number): number => levelOnDay.findIndex((l) => l >= lvl) + 1;
    expect(firstDay(1)).toBeGreaterThanOrEqual(2);
    expect(firstDay(1)).toBeLessThanOrEqual(3);
    expect(firstDay(2)).toBeGreaterThanOrEqual(5);
    expect(firstDay(2)).toBeLessThanOrEqual(8);
    expect(firstDay(3)).toBeGreaterThanOrEqual(9);
    expect(firstDay(3)).toBeLessThanOrEqual(14);
    expect(b.points).toBeLessThanOrEqual(BOND.MAX);
  });

  it('fades slowly with neglect, after a day of grace', () => {
    let b: Bond = { ...emptyBond(T0), points: 80, caredAt: T0, at: T0 };
    expect(bondNow(b, T0 + 20 * HOUR).points).toBe(80);
    b = bondNow(b, T0 + DAY + 2 * DAY);
    expect(b.points).toBeCloseTo(80 - 2 * BOND.FADE_PER_DAY, 5);
    expect(bondNow(b, T0 + 60 * DAY).points).toBe(0);
  });

  it('counts knocks for the inside joke, but a knock is not care', () => {
    let b = emptyBond(T0);
    b = bondEvent(b, 'knock', T0 + 1000, dayKey(T0));
    b = bondEvent(b, 'knock', T0 + 2000, dayKey(T0));
    expect(b.knocks).toBe(2);
    expect(b.points).toBe(0);
    expect(b.caredAt).toBe(T0);
  });

  it('unlocks more as it grows: your name, then the glass and memories, then inside jokes', () => {
    expect(bondPerks(0)).toEqual({ useName: false, swimToGlass: false, remembers: false, insideJokes: false, personalShare: 0 });
    expect(bondPerks(1).useName).toBe(true);
    expect(bondPerks(1).swimToGlass).toBe(false);
    expect(bondPerks(2)).toMatchObject({ swimToGlass: true, remembers: true, insideJokes: false });
    expect(bondPerks(3).insideJokes).toBe(true);
    expect(bondPerks(3).personalShare).toBeGreaterThan(bondPerks(1).personalShare);
  });

  it('reads a saved bond, keeping points in range and not believing future times', () => {
    expect(normalizeBond({ points: 250, at: T0, caredAt: T0, day: 'x', gainedToday: 3, knocks: 4 }, T0).points).toBe(BOND.MAX);
    const ahead = normalizeBond({ points: 30, at: T0 + DAY, caredAt: T0 + DAY, day: 'x', gainedToday: 1, knocks: 0 }, T0);
    expect(ahead.at).toBe(T0);
    expect(ahead.caredAt).toBe(T0);
    expect(normalizeBond(null, T0)).toEqual(emptyBond(T0));
  });
});
