import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TERR_FLOOR_RECT, TERR_OPAQUE_RECT, TERR_PANTRY_RECT, TERR_PET_ANCHOR, TERR_SITES, TERR_STAND_Y,
} from './terrarium';
import { HAMSTER_BODY, siteX } from './layout';
import { makeFloorBounds } from '../../render/water';
import { GRID_H, GRID_W } from '../../sim/constants';

// The same contract the cage's layout test enforces, against the same failure: a site whose centre
// sits past the point the clamp will let the body reach. The hamster walks toward it forever, never
// arrives, and never does the thing that happens there -- which looks like an animation bug rather
// than a layout one. It has already caught this once, with a water bottle 9 px out of reach, and it
// caught the terrarium's wall hopper at x=254 against a limit of 242.

const manifest = JSON.parse(
  readFileSync(new URL('../../../assets/manifest.json', import.meta.url), 'utf8'),
) as { habitats: Record<string, Record<string, unknown>> };

describe('terrarium layout vs the manifest', () => {
  const terr = manifest.habitats['hamster/terrarium'];

  it('matches assets/manifest.json', () => {
    expect(terr).toBeDefined();
    expect(terr?.['opaqueRect']).toEqual(TERR_OPAQUE_RECT);
    expect(terr?.['pantryRect']).toEqual(TERR_PANTRY_RECT);
    expect(terr?.['petAnchor']).toEqual([...TERR_PET_ANCHOR]);
  });

  it('describes the same walkable span the behaviour uses', () => {
    const water = terr?.['water'] as { x: number; y: number; w: number };
    expect(water.x).toBe(TERR_FLOOR_RECT.x);
    expect(water.w).toBe(TERR_FLOOR_RECT.w);
    expect(water.y).toBe(TERR_STAND_Y);
    const shape = terr?.['waterShape'] as { surfaceY: number; floorY: number };
    expect(shape.surfaceY).toBe(TERR_STAND_Y);
    expect(shape.floorY).toBe(TERR_STAND_Y);
  });

  it('ships a glass layer, which is the whole point of a tank', () => {
    const names = (terr?.['layers'] as Array<{ name: string }>).map((l) => l.name);
    expect(names).toContain('glass');
    expect(names.indexOf('glass'), 'glass must come after the pet to draw over it')
      .toBeGreaterThan(names.indexOf('pet'));
  });
});

describe('terrarium layout', () => {
  it('fits inside the habitat grid', () => {
    for (const r of [TERR_OPAQUE_RECT, TERR_PANTRY_RECT, ...Object.values(TERR_SITES)]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(GRID_W);
      expect(r.y + r.h).toBeLessThanOrEqual(GRID_H);
    }
  });

  it('keeps the walkable span and every site inside the visible tank', () => {
    expect(TERR_FLOOR_RECT.x).toBeGreaterThanOrEqual(TERR_OPAQUE_RECT.x);
    expect(TERR_FLOOR_RECT.x + TERR_FLOOR_RECT.w)
      .toBeLessThanOrEqual(TERR_OPAQUE_RECT.x + TERR_OPAQUE_RECT.w);
    expect(TERR_STAND_Y).toBeLessThanOrEqual(TERR_OPAQUE_RECT.y + TERR_OPAQUE_RECT.h);
  });

  it('leaves every site reachable with the body box on', () => {
    const bounds = makeFloorBounds({ rect: TERR_FLOOR_RECT, standY: TERR_STAND_Y });
    const halfW = HAMSTER_BODY.w / 2;
    for (const [name, rect] of Object.entries(TERR_SITES)) {
      const target = siteX(rect);
      const reached = bounds.clamp(target, TERR_STAND_Y, halfW, HAMSTER_BODY.h / 2);
      expect(reached.x, `site "${name}" at x=${target} clamps to ${reached.x}`).toBeCloseTo(target, 6);
    }
  });

  it('starts the hamster on the bedding', () => {
    expect(TERR_PET_ANCHOR[1]).toBe(TERR_STAND_Y);
    const bounds = makeFloorBounds({ rect: TERR_FLOOR_RECT, standY: TERR_STAND_Y });
    expect(bounds.inside(TERR_PET_ANCHOR[0], TERR_PET_ANCHOR[1])).toBe(true);
  });

  it('gives the body box room to pass between the two furthest sites', () => {
    const xs = Object.values(TERR_SITES).map(siteX);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(HAMSTER_BODY.w);
  });
});
