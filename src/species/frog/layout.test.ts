import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FROG_BODY, FROG_MOUTH, JAR_BANK, JAR_FLOOR_RECT, JAR_OPAQUE_RECT, JAR_PET_ANCHOR, JAR_SITES, JAR_STAND_Y,
  POND_BANK, POND_FLOOR_RECT, POND_OPAQUE_RECT, POND_PET_ANCHOR, POND_SITES, POND_STAND_Y,
} from './layout';
import { GRID_H, GRID_W } from '../../sim/constants';

// layout.ts, assets/manifest.json and each habitat's geometry.json (written by s5_finish.py from the
// model) must agree: the renderer reads the manifest, the behaviour reads layout.ts, and the geometry
// file is what the model actually measured.

const read = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../../../assets/${rel}`, import.meta.url), 'utf8')) as Record<string, unknown>;
const manifest = read('manifest.json') as { habitats: Record<string, Record<string, unknown>>; sprites: Record<string, Record<string, unknown>> };

const HABITATS = [
  { key: 'pond', stand: POND_STAND_Y, floor: POND_FLOOR_RECT, sites: POND_SITES, bank: POND_BANK, opaque: POND_OPAQUE_RECT, anchor: POND_PET_ANCHOR },
  { key: 'jar', stand: JAR_STAND_Y, floor: JAR_FLOOR_RECT, sites: JAR_SITES, bank: JAR_BANK, opaque: JAR_OPAQUE_RECT, anchor: JAR_PET_ANCHOR },
] as const;

describe.each(HABITATS)('frog layout: the $key', (h) => {
  const man = manifest.habitats[`frog/${h.key}`];
  const geom = read(`habitats/frog/${h.key}/geometry.json`) as {
    opaqueRect: unknown; standY: number; walk: [number, number]; anchor: unknown;
    sites: Record<string, [number, number]>; bank: { x0: number; x1: number; y: number }; body: unknown;
  };

  it('matches assets/manifest.json', () => {
    expect(man).toBeDefined();
    expect(man?.['opaqueRect']).toEqual(h.opaque);
    expect(man?.['petAnchor']).toEqual([...h.anchor]);
    expect(manifest.sprites['frog']?.['body']).toEqual(FROG_BODY);
    const water = man?.['water'] as { x: number; y: number; w: number };
    expect(water.x).toBe(h.floor.x);
    expect(water.w).toBe(h.floor.w);
    expect(water.y).toBe(h.stand);
    const amb = man?.['ambient'] as { tongue?: { mouth: [number, number] } };
    expect(amb.tongue?.mouth).toEqual([...FROG_MOUTH]);
  });

  it('matches what the model measured (geometry.json)', () => {
    expect(geom.opaqueRect).toEqual(h.opaque);
    expect(geom.standY).toBe(h.stand);
    expect(geom.walk).toEqual([h.floor.x, h.floor.x + h.floor.w]);
    expect(geom.anchor).toEqual([...h.anchor]);
    expect(geom.body).toEqual(FROG_BODY);
    for (const name of ['pad', 'rock']) {
      const s = h.sites[name]!;
      expect([s.x, s.y]).toEqual(geom.sites[name]);
    }
    expect({ x0: h.bank.x0, x1: h.bank.x1, y: h.bank.y }).toEqual(geom.bank);
  });

  it('is coherent: perches and bank inside the habitat, the bank in front of the perches', () => {
    for (const s of Object.values(h.sites)) {
      expect(s.x).toBeGreaterThan(h.opaque.x);
      expect(s.x).toBeLessThan(h.opaque.x + h.opaque.w);
      expect(s.y).toBeGreaterThan(h.opaque.y);
      expect(s.y).toBeLessThan(h.opaque.y + h.opaque.h);
      // nearer the camera is lower on screen
      expect(h.bank.y).toBeGreaterThan(s.y + FROG_BODY.h / 2);
    }
    expect(h.bank.x0).toBeLessThan(h.bank.x1);
    expect(h.bank.x0).toBeGreaterThanOrEqual(h.opaque.x);
    expect(h.bank.x1).toBeLessThanOrEqual(h.opaque.x + h.opaque.w);
    expect(h.bank.y).toBeLessThan(h.opaque.y + h.opaque.h);
    expect(h.opaque.x + h.opaque.w).toBeLessThanOrEqual(GRID_W);
    expect(h.opaque.y + h.opaque.h).toBeLessThanOrEqual(GRID_H);
    // the frog starts on its pad
    expect(Math.abs(h.anchor[0] - h.sites['pad']!.x)).toBeLessThan(0.5);
    expect(Math.abs(h.anchor[1] - h.sites['pad']!.y)).toBeLessThan(0.5);
  });
});
