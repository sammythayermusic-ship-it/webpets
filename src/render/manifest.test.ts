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
    // The bowl's own layers, bottom to top. `pet`, `food` and `fx` are the procedural slots the scene
    // fills; the point of the order is that `decor_front` and `glass` come AFTER `pet`, which is what
    // puts the fish inside the tank rather than pasted on the front of it.
    expect(bowl?.layers.map((l) => l.name)).toEqual([
      'bg', 'memorial', 'pet', 'food', 'fx', 'decor_front', 'glass',
    ]);
    const petIndex = bowl?.layers.findIndex((l) => l.name === 'pet') ?? -1;
    for (const front of ['decor_front', 'glass']) {
      expect(bowl?.layers.findIndex((l) => l.name === front), `${front} must draw over the pet`).toBeGreaterThan(petIndex);
    }
    const fish = m.sprites['fish'];
    // The LOGICAL frame. The art is a whole multiple of it, derived from the texture at load time.
    expect(fish?.frame).toEqual([80, 80]);
    expect(fish?.fps, 'the art was rendered at 12 fps, independent of the 8 Hz simulation tick').toBe(12);
    expect(Object.keys(fish?.states ?? {}).sort()).toEqual([
      'curious', 'dead', 'eat', 'excited', 'happy', 'hungry', 'idle', 'sleep',
    ]);
    expect(fish?.states['eat']?.returnTo).toBe('idle');
    // Every state is a rendered sequence now; the strip form stays supported for other species.
    for (const [name, st] of Object.entries(fish?.states ?? {})) {
      expect(st.source.kind, `${name} source`).toBe('sequence');
    }
  });

  it('rejects a sequence whose file count disagrees with its frame count', () => {
    // The failure this prevents is a cycle quietly one frame short, which shows up as a stutter nobody
    // can place rather than as an error.
    const bad = JSON.parse(JSON.stringify(raw)) as {
      sprites: Record<string, { states: Record<string, { source: { files: string[] } }> }>;
    };
    bad.sprites['fish']?.states['idle']?.source.files.pop();
    expect(() => parseManifest(bad)).toThrow(/to match "frames"/);
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
    bad2.sprites['fish']?.states['idle']?.sequence.push(99);
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
