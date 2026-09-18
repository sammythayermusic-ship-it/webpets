import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCALE,
  GRID_H,
  GRID_W,
  SCALES,
  SCALE_L,
  SCALE_M,
  SCALE_S,
  WINDOW_PAD,
  windowSizeForScale,
} from './constants';

// `SCALES` and `DEFAULT_SCALE` have to be plain literals so the Rust `contract_sync` test can parse
// this file as text. That duplicates SCALE_S/M/L, so pin the two spellings to each other here.
describe('the scale ladder', () => {
  it('lists exactly S, M, L in ascending order', () => {
    expect(SCALES).toEqual([SCALE_S, SCALE_M, SCALE_L]);
    expect([...SCALES]).toEqual([...SCALES].sort((a, b) => a - b));
  });

  it('defaults to M', () => {
    expect(DEFAULT_SCALE).toBe(SCALE_M);
  });
});

describe('windowSizeForScale', () => {
  it('matches the contract sizes S/M/L', () => {
    expect(windowSizeForScale(SCALE_S)).toEqual({ width: 368, height: 288 });
    expect(windowSizeForScale(SCALE_M)).toEqual({ width: 688, height: 528 });
    expect(windowSizeForScale(SCALE_L)).toEqual({ width: 1008, height: 768 });
  });

  it('is the grid plus WINDOW_PAD on every side', () => {
    for (const s of SCALES) {
      expect(windowSizeForScale(s)).toEqual({
        width: GRID_W * s + 2 * WINDOW_PAD,
        height: GRID_H * s + 2 * WINDOW_PAD,
      });
    }
  });
});
