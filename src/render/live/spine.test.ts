import { describe, expect, it } from 'vitest';
import { advancePhase, facingYaw, spineParams, turnBank, turnEase, type SpineInput } from './spine';

const base: SpineInput = { speed: 0, vy: 0, turning: false, anim: 'idle', expression: null };

describe('spineParams', () => {
  it('beats faster and bends more the faster the fish swims', () => {
    const slow = spineParams({ ...base, speed: 0.5 });
    const cruise = spineParams({ ...base, speed: 3 });
    const dart = spineParams({ ...base, speed: 6 });
    expect(cruise.hz).toBeGreaterThan(slow.hz);
    expect(dart.hz).toBeGreaterThan(cruise.hz);
    expect(cruise.amplitude).toBeGreaterThan(slow.amplitude);
    expect(cruise.finHz).toBeGreaterThan(slow.finHz);
  });

  it('never stops moving when idle: a still fish is a dead fish', () => {
    const idle = spineParams(base);
    expect(idle.amplitude).toBeGreaterThan(0);
    expect(idle.hz).toBeGreaterThan(0);
  });

  it('slows and quietens when hungry, asleep and dead, in that order', () => {
    const idle = spineParams(base);
    const hungry = spineParams({ ...base, anim: 'hungry' });
    const sleep = spineParams({ ...base, anim: 'sleep' });
    const dead = spineParams({ ...base, anim: 'dead' });
    expect(hungry.hz).toBeLessThan(idle.hz);
    expect(sleep.hz).toBeLessThan(hungry.hz);
    expect(dead.hz).toBeLessThan(sleep.hz);
    expect(dead.amplitude).toBeLessThan(sleep.amplitude);
    expect(sleep.amplitude).toBeLessThan(hungry.amplitude);
    expect(hungry.amplitude).toBeLessThan(idle.amplitude);
  });

  it('noses down when diving and up when climbing', () => {
    const dive = spineParams({ ...base, speed: 3, vy: 2 });
    const climb = spineParams({ ...base, speed: 3, vy: -2 });
    expect(dive.pitch).toBeLessThan(0);
    expect(climb.pitch).toBeGreaterThan(0);
    expect(Math.abs(dive.pitch)).toBeLessThanOrEqual(0.35);
  });

  it('puts more energy into a turn, but not into a corpse', () => {
    const straight = spineParams({ ...base, speed: 2 });
    const turning = spineParams({ ...base, speed: 2, turning: true });
    expect(turning.amplitude).toBeGreaterThan(straight.amplitude);
    const dead = spineParams({ ...base, anim: 'dead' });
    const deadTurning = spineParams({ ...base, anim: 'dead', turning: true });
    expect(deadTurning).toEqual(dead);
  });

  it('lets the mood show only when the simulation is idle', () => {
    const excited = spineParams({ ...base, expression: 'excited' });
    expect(excited.hz).toBeGreaterThan(spineParams(base).hz);
    const hungryExcited = spineParams({ ...base, anim: 'hungry', expression: 'excited' });
    expect(hungryExcited).toEqual(spineParams({ ...base, anim: 'hungry' }));
  });
});

describe('phase and turn helpers', () => {
  it('advances phase by 2π per beat', () => {
    expect(advancePhase(0, 2, 500)).toBeCloseTo(2 * Math.PI, 9);
  });

  it('wraps so a long session never grows the phase without bound', () => {
    expect(advancePhase(1e4, 1, 1000)).toBeLessThan(1e4);
  });

  it('turns through the camera side', () => {
    expect(facingYaw(1)).toBe(0);
    expect(facingYaw(-1)).toBe(-Math.PI);
    const mid = facingYaw(1) + (facingYaw(-1) - facingYaw(1)) * turnEase(0.5);
    expect(mid).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('eases with flat ends and banks most mid-turn', () => {
    expect(turnEase(0)).toBe(0);
    expect(turnEase(1)).toBe(1);
    expect(turnEase(0.5)).toBeCloseTo(0.5, 9);
    expect(turnEase(1.5)).toBe(1);
    expect(turnBank(0, 0.3)).toBeCloseTo(0, 9);
    expect(turnBank(0.5, 0.3)).toBeCloseTo(0.3, 9);
    expect(turnBank(1, 0.3)).toBeCloseTo(0, 9);
  });
});
