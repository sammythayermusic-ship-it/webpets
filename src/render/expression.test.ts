import { describe, expect, it } from 'vitest';
import { createExpressionGate } from './expression';

describe('expression gate', () => {
  it('does not adopt a new feeling until it has held for the full window', () => {
    const g = createExpressionGate(3);
    expect(g.update('happy')).toBeNull();
    expect(g.update('happy')).toBeNull();
    expect(g.update('happy')).toBe('happy');
  });

  it('ignores a mood that flickers across a boundary, which is the whole point', () => {
    const g = createExpressionGate(4);
    // A pet sitting exactly on the excited/happy line, alternating every tick. Neither ever holds, so
    // the pet keeps swimming normally instead of twitching between two poses eight times a second.
    for (let i = 0; i < 20; i += 1) expect(g.update(i % 2 === 0 ? 'excited' : 'happy')).toBeNull();
    expect(g.current()).toBeNull();
  });

  it('restarts the count when the request changes mid-wait', () => {
    const g = createExpressionGate(3);
    g.update('happy');
    g.update('happy');
    expect(g.update('curious'), 'a different feeling starts its own clock').toBeNull();
    expect(g.update('curious')).toBeNull();
    expect(g.update('curious')).toBe('curious');
  });

  it('drops an expression immediately, because holding one through a state change looks like a bug', () => {
    const g = createExpressionGate(5);
    for (let i = 0; i < 5; i += 1) g.update('excited');
    expect(g.current()).toBe('excited');
    expect(g.update(null)).toBeNull();
  });

  it('keeps holding while the same feeling continues', () => {
    const g = createExpressionGate(2);
    g.update('happy');
    g.update('happy');
    for (let i = 0; i < 50; i += 1) expect(g.update('happy')).toBe('happy');
  });

  it('a hold of 1 adopts immediately, and 0 or less never blocks', () => {
    expect(createExpressionGate(1).update('happy')).toBe('happy');
    expect(createExpressionGate(0).update('curious')).toBe('curious');
  });

  it('reset clears both the held pose and any pending one', () => {
    const g = createExpressionGate(3);
    for (let i = 0; i < 3; i += 1) g.update('excited');
    g.update('happy');
    g.reset();
    expect(g.current()).toBeNull();
    expect(g.update('happy')).toBeNull(); // the pending count started over
  });
});
