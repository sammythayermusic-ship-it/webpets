import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseManifest } from './manifest';

const raw = JSON.parse(readFileSync(new URL('../../assets/manifest.json', import.meta.url), 'utf8')) as unknown;

describe('parseManifest', () => {
  it('accepts the checked-in manifest', () => {
    const m = parseManifest(raw);
    expect(m.version).toBe(1);
    const bowl = m.habitats['fish/bowl'];
    expect(bowl).toBeDefined();
    expect(bowl?.grid).toEqual([320, 240]);
    expect(bowl?.layers.map((l) => l.name)).toEqual([
      'bg', 'memorial', 'medium', 'decor_back', 'pet', 'food', 'decor_front', 'glass', 'fx', 'night', 'shadow',
    ]);
    const fish = m.sprites['fish'];
    expect(fish?.frame).toEqual([160, 160]);
    // happy/excited/curious ship ahead of the code that plays them: PetAnim does not name them yet, and
    // the sprite player only ever looks up the state it is asked for, so declaring them is inert.
    expect(Object.keys(fish?.states ?? {})).toEqual([
      'idle', 'eat', 'hungry', 'sleep', 'dead', 'happy', 'excited', 'curious',
    ]);
    expect(fish?.states['eat']?.returnTo).toBe('idle');
  });

  it('rejects a wrong version, unknown layers and out-of-range frames', () => {
    expect(() => parseManifest({ version: 2, habitats: {}, sprites: {} })).toThrow(/version/);
    const bad = JSON.parse(JSON.stringify(raw)) as { habitats: Record<string, { layers: Array<{ name: string }> }> };
    const layers = bad.habitats['fish/bowl']?.layers;
    if (layers?.[0]) layers[0].name = 'sky';
    expect(() => parseManifest(bad)).toThrow(/unknown layer "sky"/);
    const bad2 = JSON.parse(JSON.stringify(raw)) as {
      sprites: Record<string, { states: Record<string, { sequence: number[] }> }>;
    };
    bad2.sprites['fish']?.states['idle']?.sequence.push(9);
    expect(() => parseManifest(bad2)).toThrow(/out of range/);
  });

  it('rejects @2x asset names and absolute paths', () => {
    const bad = JSON.parse(JSON.stringify(raw)) as { habitats: Record<string, { layers: Array<{ file?: string }> }> };
    const layers = bad.habitats['fish/bowl']?.layers;
    if (layers?.[0]) layers[0].file = 'habitats/fish/bowl/bg@2x.png';
    expect(() => parseManifest(bad)).toThrow(/@Nx/);
    if (layers?.[0]) layers[0].file = '/habitats/fish/bowl/bg.png';
    expect(() => parseManifest(bad)).toThrow(/relative/);
  });
});
