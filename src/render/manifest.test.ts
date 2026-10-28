import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layerArt, layerImageFiles, layerNightArt, layerVideoFiles, parseManifest } from './manifest';

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
    // `medium` is the water loop, an animated crop drawn over the bg and under the pet.
    expect(bowl?.layers.map((l) => l.name)).toEqual([
      'bg', 'memorial', 'medium', 'pet', 'food', 'fx', 'decor_front', 'glass',
    ]);
    const petIndex = bowl?.layers.findIndex((l) => l.name === 'pet') ?? -1;
    for (const front of ['decor_front', 'glass']) {
      expect(bowl?.layers.findIndex((l) => l.name === front), `${front} must draw over the pet`).toBeGreaterThan(petIndex);
    }
    const fish = m.sprites['fish'];
    // The LOGICAL frame. The art is a whole multiple of it, derived from the texture at load time.
    expect(fish?.frame).toEqual([80, 80]);
    expect(fish?.fps, 'the art has its own rate, independent of the 8 Hz simulation tick').toBe(12);
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

/** A tiny valid manifest to mutate: one habitat, one sprite, nothing from disk. */
function tiny(layers: unknown[]): unknown {
  return {
    version: 1,
    habitats: {
      'fish/bowl': {
        grid: [320, 240],
        layers,
        water: { x: 0, y: 0, w: 10, h: 10 },
        waterShape: { cx: 5, cy: 5, rx: 5, ry: 5, surfaceY: 0, floorY: 10 },
        petAnchor: [5, 5],
        opaqueRect: { x: 0, y: 0, w: 10, h: 10 },
      },
    },
    sprites: {},
  };
}

describe('animated layers', () => {
  it('parses a frame sequence with its own fps, a region and a mask', () => {
    const m = parseManifest(tiny([
      { name: 'bg', file: 'a/bg.png', z: 0 },
      { name: 'medium', frames: ['a/w1.png', 'a/w2.png'], fps: 24, loop: true, z: 0, region: { x: 4, y: 8, w: 100, h: 60 }, mask: { cx: 50, cy: 40, rx: 50, ry: 40 } },
    ]));
    const medium = m.habitats['fish/bowl']?.layers[1];
    expect(medium?.frames).toEqual(['a/w1.png', 'a/w2.png']);
    expect(medium?.fps).toBe(24);
    expect(medium?.region).toEqual({ x: 4, y: 8, w: 100, h: 60 });
    expect(medium?.mask).toEqual({ cx: 50, cy: 40, rx: 50, ry: 40 });
    expect(layerArt(medium as never)).toEqual({ kind: 'frames', files: ['a/w1.png', 'a/w2.png'], fps: 24, loop: true });
    expect(layerImageFiles(medium as never)).toEqual(['a/w1.png', 'a/w2.png']);
    expect(layerVideoFiles(medium as never)).toEqual([]);
  });

  it('parses a video layer, looping by default, and lists it as a video rather than an image', () => {
    const m = parseManifest(tiny([{ name: 'medium', video: 'a/water.mp4', z: 0 }]));
    const l = m.habitats['fish/bowl']?.layers[0];
    expect(layerArt(l as never)).toEqual({ kind: 'video', file: 'a/water.mp4', loop: true });
    expect(layerImageFiles(l as never)).toEqual([]);
    expect(layerVideoFiles(l as never)).toEqual(['a/water.mp4']);
  });

  it('a still is still a still', () => {
    const m = parseManifest(tiny([{ name: 'bg', file: 'a/bg.png', z: 0 }]));
    const l = m.habitats['fish/bowl']?.layers[0];
    expect(layerArt(l as never)).toEqual({ kind: 'image', file: 'a/bg.png' });
    expect(layerNightArt(l as never)).toBeNull();
    expect(layerArt({ z: 0 } as never)).toBeNull();
  });

  it('refuses a layer that names more than one kind of art, or fps on a still', () => {
    expect(() => parseManifest(tiny([{ name: 'bg', file: 'a/bg.png', video: 'a/bg.mp4', z: 0 }]))).toThrow(/one of file \| frames \| video/);
    expect(() => parseManifest(tiny([{ name: 'bg', frames: [], z: 0 }]))).toThrow(/non-empty/);
    expect(() => parseManifest(tiny([{ name: 'pet', fps: 24, z: 0 }]))).toThrow(/animated layer/);
    expect(() => parseManifest(tiny([{ name: 'medium', frames: ['a/w1.png'], fps: 0, z: 0 }]))).toThrow(/fps/);
  });

  it('night plates must be the same kind as the day art, with the same frame count', () => {
    const ok = parseManifest(tiny([
      { name: 'bg', file: 'a/bg.png', night: { file: 'a/bg_night.png' }, z: 0 },
      { name: 'medium', frames: ['a/1.png', 'a/2.png'], fps: 12, night: { frames: ['a/n1.png', 'a/n2.png'] }, z: 0 },
      { name: 'glass', video: 'a/g.mp4', night: { video: 'a/g_night.mp4' }, z: 0 },
    ]));
    const [bg, medium, glass] = ok.habitats['fish/bowl']?.layers ?? [];
    expect(layerNightArt(bg as never)).toEqual({ kind: 'image', file: 'a/bg_night.png' });
    expect(layerImageFiles(bg as never)).toEqual(['a/bg.png', 'a/bg_night.png']);
    // The night sequence inherits the day fps and loop so the two clocks agree.
    expect(layerNightArt(medium as never)).toEqual({ kind: 'frames', files: ['a/n1.png', 'a/n2.png'], fps: 12, loop: true });
    expect(layerVideoFiles(glass as never)).toEqual(['a/g.mp4', 'a/g_night.mp4']);
    expect(() => parseManifest(tiny([{ name: 'bg', file: 'a/bg.png', night: { video: 'a/n.mp4' }, z: 0 }]))).toThrow(/same kind/);
    expect(() => parseManifest(tiny([{ name: 'bg', night: { file: 'a/n.png' }, z: 0 }]))).toThrow(/day art/);
    expect(() => parseManifest(tiny([{ name: 'medium', frames: ['a/1.png', 'a/2.png'], night: { frames: ['a/n1.png'] }, z: 0 }]))).toThrow(/match the day sequence/);
    expect(() => parseManifest(tiny([{ name: 'bg', file: 'a/bg.png', night: {}, z: 0 }]))).toThrow(/exactly one/);
  });

  it('rejects an empty region', () => {
    expect(() => parseManifest(tiny([{ name: 'medium', video: 'a/w.mp4', z: 0, region: { x: 0, y: 0, w: 0, h: 10 } }]))).toThrow(/positive size/);
  });
});
