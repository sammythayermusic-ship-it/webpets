import { describe, expect, it } from 'vitest';
import { commandFor, nextScale, SCALE_STEP } from './keys';
import { MAX_SCALE, MIN_SCALE, SCALE_M } from '../sim/constants';

function key(code: string, mods: { meta?: boolean; alt?: boolean; ctrl?: boolean } = {}) {
  return { code, metaKey: mods.meta ?? false, altKey: mods.alt ?? false, ctrlKey: mods.ctrl ?? false };
}

describe('commandFor', () => {
  it('maps Meta+Equal / Meta+NumpadAdd to scale-up', () => {
    expect(commandFor(key('Equal', { meta: true }))).toBe('scale-up');
    expect(commandFor(key('NumpadAdd', { meta: true }))).toBe('scale-up');
  });
  it('maps Meta+Minus / Meta+NumpadSubtract to scale-down', () => {
    expect(commandFor(key('Minus', { meta: true }))).toBe('scale-down');
    expect(commandFor(key('NumpadSubtract', { meta: true }))).toBe('scale-down');
  });
  it('maps Alt+Meta+KeyD to dev-panel and nothing else with Alt', () => {
    expect(commandFor(key('KeyD', { meta: true, alt: true }))).toBe('dev-panel');
    expect(commandFor(key('Equal', { meta: true, alt: true }))).toBeNull();
  });
  it('ignores keys without Meta, with Ctrl, or unrelated codes', () => {
    expect(commandFor(key('Equal'))).toBeNull();
    expect(commandFor(key('Equal', { meta: true, ctrl: true }))).toBeNull();
    expect(commandFor(key('KeyD', { meta: true }))).toBeNull();
  });
});

describe('nextScale', () => {
  it('steps by a quarter of the grid and stops at the ends', () => {
    // A quarter per press rather than an eighth: at one step the range is 26 presses end to end,
    // which is not a shortcut. A quarter keeps Small, Medium and Large reachable from each other.
    expect(nextScale(SCALE_M, 1)).toBe(SCALE_M + SCALE_STEP);
    expect(nextScale(SCALE_M, -1)).toBe(SCALE_M - SCALE_STEP);
    expect(nextScale(MAX_SCALE, 1), 'nothing above the ceiling').toBeNull();
    expect(nextScale(MIN_SCALE, -1), 'nothing below the floor').toBeNull();
    expect(nextScale(MAX_SCALE, -1)).toBe(MAX_SCALE - SCALE_STEP);
  });

  it('walks the whole range without getting stuck or overshooting', () => {
    let n = MIN_SCALE;
    const seen = [n];
    for (let i = 0; i < 100; i += 1) {
      const next = nextScale(n, 1);
      if (next === null) break;
      expect(next, 'must always move upward').toBeGreaterThan(n);
      n = next;
      seen.push(n);
    }
    expect(n, 'reaches the ceiling').toBe(MAX_SCALE);
    expect(seen.length, 'in a sensible number of presses').toBeLessThanOrEqual(16);
  });
});

describe('dev panel fallback chord', () => {
  it('also accepts Shift+Alt+Meta+KeyD, since macOS may swallow plain Alt+Meta+D', () => {
    expect(commandFor({ code: 'KeyD', metaKey: true, altKey: true, ctrlKey: false })).toBe('dev-panel');
    // Shift is not part of the match, so the Shift variant resolves to the same command.
    expect(commandFor({ code: 'KeyD', metaKey: true, altKey: true, ctrlKey: false, shiftKey: true } as Parameters<typeof commandFor>[0])).toBe('dev-panel');
  });
});
