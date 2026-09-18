import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOWL_OPAQUE_RECT, BOWL_PANTRY_RECT, BOWL_PET_ANCHOR, BOWL_WATER_RECT, BOWL_WATER_SHAPE, FISH_BODY } from './layout';

// The contract requires assets/manifest.json and layout.ts to stay in sync; this test enforces it.
const manifestUrl = new URL('../../../assets/manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as {
  habitats: Record<string, Record<string, unknown>>;
  sprites: Record<string, Record<string, unknown>>;
};

describe('fish bowl layout', () => {
  const bowl = manifest.habitats['fish/bowl'];

  it('matches assets/manifest.json', () => {
    expect(bowl).toBeDefined();
    expect(bowl?.['waterShape']).toEqual(BOWL_WATER_SHAPE);
    expect(bowl?.['pantryRect']).toEqual(BOWL_PANTRY_RECT);
    expect(bowl?.['opaqueRect']).toEqual(BOWL_OPAQUE_RECT);
    expect(bowl?.['water']).toEqual(BOWL_WATER_RECT);
    expect(bowl?.['petAnchor']).toEqual([...BOWL_PET_ANCHOR]);
    // The body box is the one sprite number behavior depends on, so it is pinned here too.
    expect(manifest.sprites['fish']?.['body']).toEqual(FISH_BODY);
  });

  it('keeps the pantry rect inside the opaque rect and above the water', () => {
    const p = BOWL_PANTRY_RECT;
    const o = BOWL_OPAQUE_RECT;
    expect(p.x).toBeGreaterThanOrEqual(o.x);
    expect(p.x + p.w).toBeLessThanOrEqual(o.x + o.w);
    expect(p.y).toBeGreaterThanOrEqual(o.y);
    expect(p.y + p.h).toBeLessThanOrEqual(BOWL_WATER_SHAPE.surfaceY);
  });
});
