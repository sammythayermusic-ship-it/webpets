import { describe, expect, it } from 'vitest';
import { computeHitRegions, pillStripRect, rectEquals, roundRect } from './hitRegions';

describe('pillStripRect', () => {
  it('extends the pill down to the habitat top so the gap is clickable', () => {
    // pill at y 4..20, bowl's opaque top at 24 + 4*3 = 36 (scale 3)
    const r = pillStripRect({ x: 100, y: 4, w: 220, h: 16 }, 36);
    expect(r).toEqual({ x: 100, y: 4, w: 220, h: 32 });
  });
  it('never shrinks the pill when it already overlaps the habitat', () => {
    const r = pillStripRect({ x: 10, y: 30, w: 50, h: 16 }, 24);
    expect(r).toEqual({ x: 10, y: 30, w: 50, h: 16 });
  });
  it('rounds to integers', () => {
    const r = pillStripRect({ x: 10.4, y: 3.6, w: 50.5, h: 16 }, 24);
    expect(r).toEqual({ x: 10, y: 4, w: 51, h: 20 });
  });
});

describe('rectEquals', () => {
  it('is true only when every edge matches', () => {
    const a = { x: 100, y: 4, w: 220, h: 16 };
    expect(rectEquals(a, { ...a })).toBe(true);
    // A longer name widens and re-centers the pill: x and w change, y and h do not.
    expect(rectEquals(a, { ...a, x: 90, w: 240 })).toBe(false);
    expect(rectEquals(a, { ...a, y: 5 })).toBe(false);
    expect(rectEquals(a, { ...a, h: 17 })).toBe(false);
  });
});

describe('roundRect', () => {
  it('rounds and clamps negative sizes to zero', () => {
    expect(roundRect({ x: 1.2, y: 2.7, w: -3, h: 4.5 })).toEqual({ x: 1, y: 3, w: 0, h: 5 });
  });
});

describe('computeHitRegions', () => {
  const scene = { habitatHitRect: () => ({ x: 144, y: 36, w: 252, h: 345 }) };

  it('is only the habitat when the HUD is hidden and the panel closed', () => {
    const out = computeHitRegions(scene, { getRects: () => [] }, { getRect: () => null });
    expect(out).toEqual([{ x: 144, y: 36, w: 252, h: 345 }]);
  });

  it('adds HUD rects and the dev panel rect, dropping empty ones', () => {
    const out = computeHitRegions(
      scene,
      {
        getRects: () => [
          { x: 100, y: 4, w: 220, h: 32 },
          { x: 0, y: 0, w: 0, h: 0 },
          { x: 180, y: 390, w: 130, h: 12 },
        ],
      },
      { getRect: () => ({ x: 4, y: 4, w: 520, h: 400 }) },
    );
    expect(out).toEqual([
      { x: 144, y: 36, w: 252, h: 345 },
      { x: 100, y: 4, w: 220, h: 32 },
      { x: 180, y: 390, w: 130, h: 12 },
      { x: 4, y: 4, w: 520, h: 400 },
    ]);
  });
});
