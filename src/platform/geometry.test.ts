import { describe, expect, it } from 'vitest';
import { pointerInside, rectContains, windowSizeForScale } from './geometry';

describe('windowSizeForScale', () => {
  it('matches the contract sizes S/M/L', () => {
    expect(windowSizeForScale(2)).toEqual({ width: 368, height: 288 });
    expect(windowSizeForScale(3)).toEqual({ width: 528, height: 408 });
    expect(windowSizeForScale(4)).toEqual({ width: 688, height: 528 });
  });
});

describe('rectContains', () => {
  const r = { x: 10, y: 20, w: 30, h: 40 };
  it('is inclusive at the top-left and exclusive at the bottom-right', () => {
    expect(rectContains(r, 10, 20)).toBe(true);
    expect(rectContains(r, 39, 59)).toBe(true);
    expect(rectContains(r, 40, 59)).toBe(false);
    expect(rectContains(r, 39, 60)).toBe(false);
    expect(rectContains(r, 9, 20)).toBe(false);
  });
});

describe('pointerInside', () => {
  it('treats every point as inside while no regions are registered', () => {
    expect(pointerInside([], 0, 0)).toBe(true);
    expect(pointerInside([], 999, 999)).toBe(true);
  });
  it('requires a containing region once regions exist', () => {
    const regions = [
      { x: 24, y: 24, w: 100, h: 100 },
      { x: 200, y: 0, w: 10, h: 10 },
    ];
    expect(pointerInside(regions, 50, 50)).toBe(true);
    expect(pointerInside(regions, 205, 5)).toBe(true);
    expect(pointerInside(regions, 5, 5)).toBe(false);
    expect(pointerInside(regions, 124, 50)).toBe(false);
  });
});
