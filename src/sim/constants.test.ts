import { describe, expect, it } from 'vitest';
import {
  clampScale,
  DEFAULT_SCALE,
  GRID_H,
  GRID_W,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_L,
  SCALE_M,
  SCALE_S,
  SCALE_STEPS_PER_UNIT,
  scaleFactor,
  WINDOW_PAD,
  windowSizeForScale,
} from './constants';

// The scale used to be three named rungs, because only whole multiples of the grid were legal while
// the renderer drew on a pixel grid. It is a continuous count of eighths now; what has to hold is that
// every value of it produces a whole number of pixels, in this language and in Rust's copy.

describe('the scale', () => {
  it('divides the grid exactly, which is what lets two languages agree to the pixel', () => {
    // The load-bearing property. If the grid were not divisible by the step count, a window size
    // would be fractional and Rust and TypeScript would each need a rounding rule that matched the
    // other's exactly -- and a one-pixel disagreement silently stops the click-through region
    // matching the art, which reads as the window eating clicks meant for the app behind it.
    expect(GRID_W % SCALE_STEPS_PER_UNIT).toBe(0);
    expect(GRID_H % SCALE_STEPS_PER_UNIT).toBe(0);
  });

  it('produces whole pixel sizes at every legal value', () => {
    for (let n = MIN_SCALE; n <= MAX_SCALE; n += 1) {
      const { width, height } = windowSizeForScale(n);
      expect(Number.isInteger(width), `width at scale ${n} is ${width}`).toBe(true);
      expect(Number.isInteger(height), `height at scale ${n} is ${height}`).toBe(true);
    }
  });

  it('keeps the named rungs inside the range, in order, at the sizes they always were', () => {
    expect([SCALE_S, SCALE_M, SCALE_L]).toEqual([...[SCALE_S, SCALE_M, SCALE_L]].sort((a, b) => a - b));
    for (const rung of [SCALE_S, SCALE_M, SCALE_L]) {
      expect(rung).toBeGreaterThanOrEqual(MIN_SCALE);
      expect(rung).toBeLessThanOrEqual(MAX_SCALE);
    }
    // Small moved from 1x to 0.75x so that a fresh install starts ON a named rung rather than between
    // two; Medium and Large are unchanged, so no existing window resizes on upgrade.
    expect(windowSizeForScale(SCALE_S)).toEqual({ width: 288, height: 228 });
    expect(windowSizeForScale(SCALE_M)).toEqual({ width: 688, height: 528 });
    expect(windowSizeForScale(SCALE_L)).toEqual({ width: 1008, height: 768 });
  });

  it('defaults to Small, and the default is not at the edge of its own range', () => {
    // A default sitting at the very bottom of the range is a sign the range is wrong: the size the app
    // starts at should have room below it as well as above.
    expect(DEFAULT_SCALE).toBe(SCALE_S);
    expect(DEFAULT_SCALE).toBeGreaterThan(MIN_SCALE);
    expect(DEFAULT_SCALE).toBeLessThan(MAX_SCALE);
  });

  it('is the grid at scaleFactor plus WINDOW_PAD on every side', () => {
    for (const n of [MIN_SCALE, SCALE_S, 11, SCALE_M, 19, SCALE_L, MAX_SCALE]) {
      expect(windowSizeForScale(n)).toEqual({
        width: GRID_W * scaleFactor(n) + 2 * WINDOW_PAD,
        height: GRID_H * scaleFactor(n) + 2 * WINDOW_PAD,
      });
    }
  });
});

describe('clampScale', () => {
  it('rounds and clamps, because the scale now arrives from a drag as well as a menu', () => {
    expect(clampScale(MIN_SCALE - 5)).toBe(MIN_SCALE);
    expect(clampScale(MAX_SCALE + 5)).toBe(MAX_SCALE);
    expect(clampScale(16.4)).toBe(16);
    expect(clampScale(16.6)).toBe(17);
  });

  it('always returns something the window layer will accept', () => {
    for (const raw of [-100, 0, 6.5, 17.2, 31.9, 1000, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]) {
      const n = clampScale(raw);
      expect(Number.isInteger(n), `clampScale(${raw}) = ${n}`).toBe(true);
      expect(n).toBeGreaterThanOrEqual(MIN_SCALE);
      expect(n).toBeLessThanOrEqual(MAX_SCALE);
    }
  });
});
