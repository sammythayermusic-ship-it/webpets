import { describe, expect, it } from 'vitest';
import { createSequencer } from './sequencer';

const states = {
  idle: { sequence: [0, 0, 1, 2], loop: true },
  eat: { sequence: [0, 1, 2, 3], loop: false, returnTo: 'idle' },
  dead: { sequence: [0, 1], loop: true },
  once: { sequence: [5, 6], loop: false },
};

describe('sequencer', () => {
  it('loops a looping sequence', () => {
    const s = createSequencer(states, 'idle');
    const seen: number[] = [];
    for (let i = 0; i < 9; i += 1) {
      seen.push(s.frame());
      s.step();
    }
    expect(seen).toEqual([0, 0, 1, 2, 0, 0, 1, 2, 0]);
  });

  it('plays once then returns to returnTo, ignoring a returnTo request while playing', () => {
    const s = createSequencer(states, 'idle');
    s.play('eat');
    expect(s.state()).toBe('eat');
    s.play('idle'); // behavior already reports idle again; the bite must still finish
    expect(s.state()).toBe('eat');
    const seen: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      seen.push(s.frame());
      s.step();
    }
    expect(seen.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(s.state()).toBe('idle');
    expect(seen[4]).toBe(0);
  });

  it('re-requesting the current state does not restart it', () => {
    const s = createSequencer(states, 'idle');
    s.step();
    s.step();
    expect(s.frame()).toBe(1);
    s.play('idle');
    expect(s.frame()).toBe(1);
  });

  it('holds the last frame of a one-shot without returnTo and can be restarted', () => {
    const s = createSequencer(states, 'once');
    s.step();
    s.step();
    s.step();
    expect(s.frame()).toBe(6);
    expect(s.finished()).toBe(true);
    s.play('once');
    expect(s.frame()).toBe(5);
    expect(s.finished()).toBe(false);
  });

  it('interrupts a one-shot with an unrelated state', () => {
    const s = createSequencer(states, 'idle');
    s.play('eat');
    s.play('dead');
    expect(s.state()).toBe('dead');
  });

  it('returns frame 0 for an unknown state', () => {
    const s = createSequencer(states, 'nope');
    s.step();
    expect(s.frame()).toBe(0);
  });
});
