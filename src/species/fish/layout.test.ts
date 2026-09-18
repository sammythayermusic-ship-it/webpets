import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOWL_OPAQUE_RECT, BOWL_PET_ANCHOR, BOWL_WATER_RECT, BOWL_WATER_SHAPE, FISH_BODY } from './layout';

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
    expect(bowl?.['opaqueRect']).toEqual(BOWL_OPAQUE_RECT);
    expect(bowl?.['water']).toEqual(BOWL_WATER_RECT);
    expect(bowl?.['petAnchor']).toEqual([...BOWL_PET_ANCHOR]);
    // The body box is the one sprite number behavior depends on, so it is pinned here too.
    expect(manifest.sprites['fish']?.['body']).toEqual(FISH_BODY);
  });

  it('puts the waterline below the glass rim, so the fish cannot swim in the air pocket', () => {
    // The whole point of surfaceY: it is the painted waterline, not the top of the bowl. When it was the
    // rim the fish could drift a quarter of the bowl above the water and read as outside the tank.
    expect(BOWL_WATER_SHAPE.surfaceY).toBeGreaterThan(BOWL_OPAQUE_RECT.y);
    expect(BOWL_WATER_SHAPE.floorY).toBeLessThanOrEqual(BOWL_OPAQUE_RECT.y + BOWL_OPAQUE_RECT.h);
    // And the pet starts in the middle of the water, not the middle of the glass.
    const waterCentre = (BOWL_WATER_SHAPE.surfaceY + BOWL_WATER_SHAPE.floorY) / 2;
    expect(Math.abs(BOWL_PET_ANCHOR[1] - waterCentre)).toBeLessThanOrEqual(1);
  });
});
