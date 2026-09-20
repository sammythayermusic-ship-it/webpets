import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAGE_FLOOR_RECT,
  CAGE_OPAQUE_RECT,
  CAGE_PANTRY_RECT,
  CAGE_PET_ANCHOR,
  CAGE_SITES,
  CAGE_STAND_Y,
  HAMSTER_BODY,
  siteX,
} from './layout';
import { makeFloorBounds } from '../../render/water';
import { GRID_H, GRID_W } from '../../sim/constants';

// Two jobs. The first block is the same contract the fish's layout test enforces: layout.ts and
// assets/manifest.json must agree, because the renderer reads one and the behaviour reads the other.
// It matters more here than it did for the fish, because a THIRD copy of these numbers lives in
// `tools/gen_placeholders.py`, which is what writes the manifest entry -- so this is the thing that
// catches someone editing layout.ts and not regenerating the art.
//
// The rest asserts the cage is internally coherent, which is most of what actually goes wrong with a
// layout and all of what would leave the hamster unable to reach its own furniture.

const manifestUrl = new URL('../../../assets/manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as {
  habitats: Record<string, Record<string, unknown>>;
  sprites: Record<string, Record<string, unknown>>;
};

describe('cage layout vs the manifest', () => {
  const cage = manifest.habitats['hamster/cage'];

  it('matches assets/manifest.json', () => {
    expect(cage).toBeDefined();
    expect(cage?.['opaqueRect']).toEqual(CAGE_OPAQUE_RECT);
    expect(cage?.['pantryRect']).toEqual(CAGE_PANTRY_RECT);
    expect(cage?.['petAnchor']).toEqual([...CAGE_PET_ANCHOR]);
    expect(manifest.sprites['hamster']?.['body']).toEqual(HAMSTER_BODY);
  });

  it('describes the same walkable span the behaviour uses', () => {
    // The manifest still carries `water`/`waterShape` because the schema requires them. For a cage they
    // are the walkable span flattened to one row, and they have to agree with the floor rect the
    // species module actually hands the behaviour -- otherwise the art is laid out for one cage and the
    // hamster walks around a different one.
    const water = cage?.['water'] as { x: number; y: number; w: number };
    expect(water.x).toBe(CAGE_FLOOR_RECT.x);
    expect(water.w).toBe(CAGE_FLOOR_RECT.w);
    expect(water.y).toBe(CAGE_STAND_Y);
    const shape = cage?.['waterShape'] as { surfaceY: number; floorY: number };
    expect(shape.surfaceY).toBe(CAGE_STAND_Y);
    expect(shape.floorY).toBe(CAGE_STAND_Y);
  });
});

describe('cage layout', () => {
  it('fits inside the habitat grid', () => {
    for (const r of [CAGE_OPAQUE_RECT, CAGE_PANTRY_RECT, ...Object.values(CAGE_SITES)]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(GRID_W);
      expect(r.y + r.h).toBeLessThanOrEqual(GRID_H);
    }
  });

  it('puts the walkable span and every site inside the visible cage', () => {
    // A site outside the opaque rect would be furniture drawn on empty desk, and a walkable span wider
    // than the cage would let the hamster stroll through the bars.
    expect(CAGE_FLOOR_RECT.x).toBeGreaterThanOrEqual(CAGE_OPAQUE_RECT.x);
    expect(CAGE_FLOOR_RECT.x + CAGE_FLOOR_RECT.w).toBeLessThanOrEqual(CAGE_OPAQUE_RECT.x + CAGE_OPAQUE_RECT.w);
    expect(CAGE_STAND_Y).toBeLessThanOrEqual(CAGE_OPAQUE_RECT.y + CAGE_OPAQUE_RECT.h);
  });

  it('leaves every site reachable with the body box on', () => {
    // The real failure this catches: a site whose centre sits past the point the clamp will allow the
    // body to reach. The hamster would walk toward it forever, never arrive, and never do the thing
    // that happens there -- a hang that looks like an animation bug rather than a layout one.
    const bounds = makeFloorBounds({ rect: CAGE_FLOOR_RECT, standY: CAGE_STAND_Y });
    const halfW = HAMSTER_BODY.w / 2;
    for (const [name, rect] of Object.entries(CAGE_SITES)) {
      const target = siteX(rect);
      const reached = bounds.clamp(target, CAGE_STAND_Y, halfW, HAMSTER_BODY.h / 2);
      expect(reached.x, `site "${name}" at x=${target} clamps to ${reached.x}`).toBeCloseTo(target, 6);
    }
  });

  it('starts the hamster on the bedding, not floating above it', () => {
    expect(CAGE_PET_ANCHOR[1]).toBe(CAGE_STAND_Y);
    const bounds = makeFloorBounds({ rect: CAGE_FLOOR_RECT, standY: CAGE_STAND_Y });
    expect(bounds.inside(CAGE_PET_ANCHOR[0], CAGE_PET_ANCHOR[1])).toBe(true);
  });

  it('keeps the pantry gauge on the hopper, since they are the same object', () => {
    const hopper = CAGE_SITES['hopper'];
    expect(hopper).toBeDefined();
    if (!hopper) return;
    expect(CAGE_PANTRY_RECT.x).toBeGreaterThanOrEqual(hopper.x);
    expect(CAGE_PANTRY_RECT.y).toBeGreaterThanOrEqual(hopper.y);
    expect(CAGE_PANTRY_RECT.x + CAGE_PANTRY_RECT.w).toBeLessThanOrEqual(hopper.x + hopper.w);
    expect(CAGE_PANTRY_RECT.y + CAGE_PANTRY_RECT.h).toBeLessThanOrEqual(hopper.y + hopper.h);
  });

  it('gives the body box room to pass between the two furthest sites', () => {
    const xs = Object.values(CAGE_SITES).map(siteX);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(HAMSTER_BODY.w);
  });
});
