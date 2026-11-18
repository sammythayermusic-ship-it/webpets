import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BROODER_FLOOR_RECT, BROODER_FOOD_ROW, BROODER_OPAQUE_RECT, BROODER_PET_ANCHOR, BROODER_SITES, BROODER_STAND_Y, CHICK_BODY,
  COOP_FLOOR_RECT, COOP_FOOD_ROW, COOP_OPAQUE_RECT, COOP_PET_ANCHOR, COOP_SITES, COOP_STAND_Y, HEN_BODY, siteX,
} from './layout';
import { makeFloorBounds } from '../../render/water';
import { GRID_H, GRID_W } from '../../sim/constants';

// layout.ts, assets/manifest.json and each habitat's geometry.json (written by s5_finish.py from the
// model) must agree, as for the frog.

const read = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../../../assets/${rel}`, import.meta.url), 'utf8')) as Record<string, unknown>;
const manifest = read('manifest.json') as { habitats: Record<string, Record<string, unknown>>; sprites: Record<string, Record<string, unknown>> };

const HABITATS = [
  { key: 'brooder', sprite: 'chicken/brooder', stand: BROODER_STAND_Y, floor: BROODER_FLOOR_RECT, sites: BROODER_SITES, foodRow: BROODER_FOOD_ROW, opaque: BROODER_OPAQUE_RECT, anchor: BROODER_PET_ANCHOR, body: CHICK_BODY },
  { key: 'coop', sprite: 'chicken', stand: COOP_STAND_Y, floor: COOP_FLOOR_RECT, sites: COOP_SITES, foodRow: COOP_FOOD_ROW, opaque: COOP_OPAQUE_RECT, anchor: COOP_PET_ANCHOR, body: HEN_BODY },
] as const;

describe.each(HABITATS)('chicken layout: the $key', (h) => {
  const man = manifest.habitats[`chicken/${h.key}`];
  const geom = read(`habitats/chicken/${h.key}/geometry.json`) as {
    opaqueRect: unknown; standY: number; walk: [number, number]; anchor: unknown; sites: Record<string, [number, number]>; foodRow: number; body: unknown;
  };

  it('matches assets/manifest.json', () => {
    expect(man).toBeDefined();
    expect(man?.['opaqueRect']).toEqual(h.opaque);
    expect(man?.['petAnchor']).toEqual([...h.anchor]);
    expect(manifest.sprites[h.sprite]?.['body']).toEqual(h.body);
    const water = man?.['water'] as { x: number; y: number; w: number };
    expect(water.x).toBe(h.floor.x);
    expect(water.w).toBe(h.floor.w);
    expect(water.y).toBe(h.stand);
  });

  it('matches what the model measured (geometry.json)', () => {
    expect(geom.opaqueRect).toEqual(h.opaque);
    expect(geom.standY).toBe(h.stand);
    expect(geom.walk).toEqual([h.floor.x, h.floor.x + h.floor.w]);
    expect(geom.anchor).toEqual([...h.anchor]);
    expect(geom.body).toEqual(h.body);
    expect(geom.foodRow).toBe(h.foodRow);
    expect(Object.keys(geom.sites).sort()).toEqual(Object.keys(h.sites).sort());
    for (const [name, s] of Object.entries(h.sites)) expect([s.x, s.y]).toEqual(geom.sites[name]);
  });

  it('is coherent: everything inside the habitat, every site reachable, feed lands in front of the feet', () => {
    const bounds = makeFloorBounds({ rect: h.floor, standY: h.stand });
    for (const s of Object.values(h.sites)) {
      const c = bounds.clamp(siteX(s), h.stand, h.body.w / 2, h.body.h / 2);
      expect(Math.abs(c.x - siteX(s))).toBeLessThan(0.001);
    }
    expect(h.floor.x).toBeGreaterThanOrEqual(h.opaque.x);
    expect(h.floor.x + h.floor.w).toBeLessThanOrEqual(h.opaque.x + h.opaque.w);
    expect(h.foodRow).toBeGreaterThan(h.stand + h.body.h / 2 - 6);
    expect(h.foodRow).toBeLessThan(h.opaque.y + h.opaque.h);
    expect(h.opaque.x + h.opaque.w).toBeLessThanOrEqual(GRID_W);
    expect(h.opaque.y + h.opaque.h).toBeLessThanOrEqual(GRID_H);
    const [ax, ay] = h.anchor;
    expect(ay).toBe(h.stand);
    expect(bounds.clamp(ax, ay, h.body.w / 2, h.body.h / 2).x).toBe(ax);
  });

  it('the coop has a nest for seven eggs and a doorway that glows', () => {
    if (h.key !== 'coop') return;
    const amb = man?.['ambient'] as { nest?: Array<[number, number]>; doorGlow?: boolean; door?: { x: number; w: number } };
    expect(amb.nest?.length).toBe(7);
    expect(amb.doorGlow).toBe(true);
    // she roosts in the doorway the glow comes from
    const door = amb.door!;
    expect(siteX(COOP_SITES['door']!)).toBeGreaterThan(door.x);
    expect(siteX(COOP_SITES['door']!)).toBeLessThan(door.x + door.w);
  });
});
