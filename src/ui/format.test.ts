import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from '../sim/constants';
import { eventLine, formatAge, formatDuration, formatOffset, formatRelative, sortEvents } from './format';

const MIN = 60_000;

describe('formatAge', () => {
  it('floors to days and hours', () => {
    expect(formatAge(3 * DAY_MS + 4 * HOUR_MS + 59 * MIN)).toBe('3d 4h');
  });
  it('clamps negatives and NaN to 0d 0h', () => {
    expect(formatAge(-5)).toBe('0d 0h');
    expect(formatAge(Number.NaN)).toBe('0d 0h');
  });
});

describe('formatDuration', () => {
  it('uses days+hours above a day', () => {
    expect(formatDuration(2 * DAY_MS + 3 * HOUR_MS + 30 * MIN)).toBe('2d 3h');
  });
  it('uses hours+minutes under a day', () => {
    expect(formatDuration(3 * HOUR_MS + 12 * MIN)).toBe('3h 12m');
    expect(formatDuration(42 * HOUR_MS)).toBe('1d 18h');
  });
  it('uses minutes under an hour', () => {
    expect(formatDuration(12 * MIN + 59_000)).toBe('12m');
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('formatRelative', () => {
  it('says just now under a minute', () => {
    expect(formatRelative(0)).toBe('just now');
    expect(formatRelative(59_999)).toBe('just now');
    expect(formatRelative(-1000)).toBe('just now');
  });
  it('appends ago', () => {
    expect(formatRelative(2 * DAY_MS + 3 * HOUR_MS)).toBe('2d 3h ago');
    expect(formatRelative(5 * MIN)).toBe('5m ago');
  });
});

describe('formatOffset', () => {
  it('prefixes a plus', () => {
    expect(formatOffset(42 * HOUR_MS)).toBe('+1d 18h');
  });
});

describe('eventLine', () => {
  it('renders every event type with the pet name', () => {
    expect(eventLine({ type: 'auto-fed', at: 1, pantryAfter: 125, hungerAfter: 75 }, 'Gus')).toBe(
      'Gus ate from the feeder (75%, 5 meals left)',
    );
    expect(eventLine({ type: 'auto-fed', at: 1, pantryAfter: 25, hungerAfter: 80 }, 'Gus')).toBe(
      'Gus ate from the feeder (80%, 1 meal left)',
    );
    expect(eventLine({ type: 'hungry', at: 1 }, 'Gus')).toBe('Gus got hungry');
    expect(eventLine({ type: 'starving', at: 1 }, 'Gus')).toBe('Gus started starving');
    expect(eventLine({ type: 'dying-soon', at: 1, diesAt: 2 }, 'Gus')).toBe('Gus had 6 hours left');
    expect(eventLine({ type: 'died', at: 1 }, 'Gus')).toBe('Gus died');
  });
});

describe('sortEvents', () => {
  it('sorts chronologically without mutating the input', () => {
    const input = [
      { type: 'died', at: 30 },
      { type: 'hungry', at: 10 },
      { type: 'starving', at: 20 },
    ] as const;
    const out = sortEvents([...input]);
    expect(out.map((e) => e.at)).toEqual([10, 20, 30]);
    expect(input[0].at).toBe(30);
  });
});
