import { describe, expect, it } from 'vitest';
import { commandFor, nextScale } from './keys';

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
  it('steps through 2/3/4 and stops at the ends', () => {
    expect(nextScale(2, 1)).toBe(3);
    expect(nextScale(3, 1)).toBe(4);
    expect(nextScale(4, 1)).toBeNull();
    expect(nextScale(4, -1)).toBe(3);
    expect(nextScale(2, -1)).toBeNull();
  });
});

describe('dev panel fallback chord', () => {
  it('also accepts Shift+Alt+Meta+KeyD, since macOS may swallow plain Alt+Meta+D', () => {
    expect(commandFor({ code: 'KeyD', metaKey: true, altKey: true, ctrlKey: false })).toBe('dev-panel');
    // Shift is not part of the match, so the Shift variant resolves to the same command.
    expect(commandFor({ code: 'KeyD', metaKey: true, altKey: true, ctrlKey: false, shiftKey: true } as Parameters<typeof commandFor>[0])).toBe('dev-panel');
  });
});
