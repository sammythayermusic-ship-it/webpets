import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng, type Rgba } from '../../tests/unit/decodePng';
import { parseManifest, stateFiles } from './manifest';
import { BOWL_OPAQUE_RECT, BOWL_WATER_SHAPE } from '../species/fish/layout';

/**
 * Properties the SHIPPED art has to have for the app to be correct. It replaces three files that
 * asserted the opposite set — hard alpha, a 38-colour palette, one row of frame-sized cells — which
 * were right for pixel art and are unsatisfiable by a render. Those retired with the generators that
 * produced the art they described (`tools/gen_bg.py`, `gen_fish.py`, `gen_placeholders.py`).
 *
 * The load-bearing test is still the alpha bbox. `habitatHitRect()` is `pad + opaqueRect * scale`
 * (src/render/scene.ts), so if opaqueRect drifts from the art either the bowl's edge stops receiving
 * clicks, or the transparent pad stops being click-through and an always-on-top window starts stealing
 * clicks from every app behind it. Neither crashes; both are miserable to diagnose.
 */

const assets = new URL('../../assets/', import.meta.url);
const manifest = parseManifest(JSON.parse(readFileSync(new URL('manifest.json', assets), 'utf8')) as unknown);
const bowl = manifest.habitats['fish/bowl'];
const fish = manifest.sprites['fish'];
if (!bowl || !fish) throw new Error('manifest has no fish/bowl habitat or fish sprite');

const bytes = (file: string): Uint8Array => new Uint8Array(readFileSync(new URL(file, assets)));
const load = (file: string): Rgba => decodePng(bytes(file));

/** Width and height straight out of the PNG's IHDR, without decoding the pixels. */
function pngSize(file: string): [number, number] {
  const b = bytes(file);
  const read = (o: number): number => ((b[o] ?? 0) << 24) | ((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0);
  return [read(16), read(20)];
}

/** Alpha bounding box at a threshold, as [x0, y0, x1, y1] inclusive, or null if nothing passes. */
function alphaBox(png: Rgba, threshold: number): [number, number, number, number] | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  const cut = threshold * 255;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if ((png.data[(y * png.width + x) * 4 + 3] ?? 0) <= cut) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

const fileLayers = bowl.layers.filter((l) => l.file !== undefined);

describe('habitat layers', () => {
  it('are all the same whole multiple of the logical grid', () => {
    // layers.ts derives each layer's scale from its own texture and throws on a non-integer ratio, so a
    // mismatch here is a crash at mount rather than a squashed bowl. This is the earlier, cheaper signal.
    const scales = new Map<string, number>();
    for (const l of fileLayers) {
      const [w, h] = pngSize(l.file as string);
      expect(w / bowl.grid[0], `${l.file} width`).toBe(Math.round(w / bowl.grid[0]));
      expect(w / bowl.grid[0], `${l.file} is not 4:3 with the grid`).toBe(h / bowl.grid[1]);
      scales.set(l.file as string, w / bowl.grid[0]);
    }
    expect(new Set(scales.values()).size, `layers disagree on scale: ${[...scales].map((s) => s.join('=')).join(', ')}`).toBe(1);
  });

  it("bg's alpha bbox is opaqueRect exactly, which is the click-through region", () => {
    const png = load('habitats/fish/bowl/bg.png');
    const scale = png.width / bowl.grid[0];
    const box = alphaBox(png, 0.5);
    expect(box).not.toBeNull();
    const [x0, y0, x1, y1] = box as [number, number, number, number];
    // Floor the minimum and ceil the maximum, so the rect can only ever over-cover the art. A rect that
    // under-covers eats clicks at the bowl's rim; one that over-covers costs a few transparent px.
    expect({
      x: Math.floor(x0 / scale),
      y: Math.floor(y0 / scale),
      w: Math.ceil((x1 + 1) / scale) - Math.floor(x0 / scale),
      h: Math.ceil((y1 + 1) / scale) - Math.floor(y0 / scale),
    }).toEqual(bowl.opaqueRect);
    expect(bowl.opaqueRect, 'layout.ts and the manifest must agree').toEqual(BOWL_OPAQUE_RECT);
  });

  it('threshold 0.5 measures the bowl, not its soft shadow', () => {
    // The render has a real contact shadow that fades out well beyond the glass. Measured at "any alpha
    // at all" it would drag the hit region across the desk and the window would swallow clicks over
    // nothing. This asserts the two thresholds genuinely differ, so the choice is load-bearing and not
    // an accident that would survive someone relaxing it.
    const png = load('habitats/fish/bowl/bg.png');
    const solid = alphaBox(png, 0.5) as [number, number, number, number];
    const any = alphaBox(png, 0.01) as [number, number, number, number];
    expect(any[2] - any[0]).toBeGreaterThan(solid[2] - solid[0]);
    expect(any[3] - any[1]).toBeGreaterThan(solid[3] - solid[1]);
  });

  it('the memorial keeps the bowl in the same place, so the hit region does not move on death', () => {
    const bg = alphaBox(load('habitats/fish/bowl/bg.png'), 0.5);
    const mem = alphaBox(load('habitats/fish/bowl/memorial.png'), 0.5);
    expect(mem).toEqual(bg);
  });

  it('memorial is a different picture, not a copy of bg', () => {
    const a = load('habitats/fish/bowl/bg.png');
    const b = load('habitats/fish/bowl/memorial.png');
    let differing = 0;
    for (let i = 0; i < a.data.length; i += 4) if (Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)) > 6) differing += 1;
    expect(differing, 'the memorial must read as a loss, not as the same bowl').toBeGreaterThan(1000);
  });

  it('the glass is mostly see-through, or the fish would be swimming behind a wall', () => {
    // The whole reason the bowl is rendered in layers: `glass` draws OVER the pet slot so the fish looks
    // like it is inside the tank. That only works if you can see through it.
    const png = load('habitats/fish/bowl/glass.png');
    const covered: number[] = [];
    for (let i = 3; i < png.data.length; i += 4) {
      const a = (png.data[i] ?? 0) / 255;
      if (a > 0.02) covered.push(a);
    }
    covered.sort((x, y) => x - y);
    const median = covered[Math.floor(covered.length / 2)] ?? 1;
    expect(median, 'median glass alpha').toBeLessThan(0.35);
    // ...and it still has to have highlights, or it is not glass, it is a tint.
    expect(covered[covered.length - 1] ?? 0, 'the brightest specular').toBeGreaterThan(0.9);
  });
});

describe('water geometry', () => {
  const geometry = JSON.parse(readFileSync(new URL('habitats/fish/bowl/geometry.json', assets), 'utf8')) as {
    resolution: [number, number];
    waterlineY_nearEdge: number;
    waterlineY_farEdge: number;
    floorY: number;
  };
  const scale = geometry.resolution[0] / bowl.grid[0];

  it('keeps the fish under the NEAR edge of the surface, not its centre', () => {
    // The surface is an ellipse seen from slightly above, so it spans a band of rows rather than one
    // line. Clamping to the middle of that band lets the fish rise in front of the visible waterline --
    // which is exactly how the painted bowl came to have a fish swimming in its air pocket.
    expect(BOWL_WATER_SHAPE.surfaceY).toBeGreaterThanOrEqual(geometry.waterlineY_nearEdge / scale);
    expect(geometry.waterlineY_nearEdge).toBeGreaterThan(geometry.waterlineY_farEdge);
  });

  it('stops at the gravel', () => {
    expect(BOWL_WATER_SHAPE.floorY).toBeLessThanOrEqual(geometry.floorY / scale);
  });

  it('leaves the fish room to swim', () => {
    // A band barely taller than the body box would clamp the figure-eight flat, which is how the fish
    // ended up swimming in a straight line once before.
    const band = BOWL_WATER_SHAPE.floorY - BOWL_WATER_SHAPE.surfaceY;
    expect(band - fish.body.h, 'vertical travel available to the body centre').toBeGreaterThan(20);
  });
});

describe('fish frames', () => {
  const states = Object.entries(fish.states);

  it('every state ships exactly the frames it declares', () => {
    for (const [name, def] of states) {
      expect(stateFiles(def).length, `${name} file count`).toBe(def.frames);
      expect(Math.max(...def.sequence), `${name} sequence references a frame it does not have`).toBeLessThan(def.frames);
    }
  });

  it('every frame is the same square, a whole multiple of the logical frame', () => {
    for (const [name, def] of states) {
      for (const f of stateFiles(def)) {
        const [w, h] = pngSize(f);
        expect([w, h], `${name}: ${f}`).toEqual([h, w]); // square
        expect(w / fish.frame[0], `${name}: ${f} is not a whole multiple of the ${fish.frame[0]}px logical frame`).toBe(
          Math.round(w / fish.frame[0]),
        );
      }
    }
  });

  it('is drawn larger than its collision box, and overhangs it by fins rather than by a body', () => {
    const png = load(stateFiles(fish.states['idle'] as never)[0] as string);
    const scale = png.width / fish.frame[0];
    const [x0, y0, x1, y1] = alphaBox(png, 0.02) as [number, number, number, number];
    const drawnW = (x1 - x0 + 1) / scale;
    const drawnH = (y1 - y0 + 1) / scale;
    expect(drawnW).toBeGreaterThan(fish.body.w);
    expect(drawnH).toBeGreaterThan(fish.body.h);
    // Fins and a tail, not a second fish: a box far smaller than the art would let the body itself
    // leave the water.
    expect((drawnW - fish.body.w) / 2, 'horizontal overhang per side').toBeLessThan(12);
    expect((drawnH - fish.body.h) / 2, 'vertical overhang per side').toBeLessThan(12);
  });

  it('is centred on the frame, because the mirror flips about that axis', () => {
    // Every turn flips scale.x about the sprite's centre. A fish drawn off-centre therefore jumps
    // sideways by twice the offset every single time it turns around.
    const png = load(stateFiles(fish.states['idle'] as never)[0] as string);
    const [x0, , x1] = alphaBox(png, 0.02) as [number, number, number, number];
    const scale = png.width / fish.frame[0];
    const offset = Math.abs((x0 + x1 + 1) / 2 - png.width / 2) / scale;
    expect(offset, 'logical px between the drawn centre and the frame centre').toBeLessThan(3);
  });

  it('never touches the edge of its frame, so nothing is clipped', () => {
    for (const [name, def] of states) {
      const files = stateFiles(def);
      const png = load(files[Math.floor(files.length / 2)] as string);
      const box = alphaBox(png, 0.02) as [number, number, number, number];
      expect(box[0], `${name} left`).toBeGreaterThan(0);
      expect(box[1], `${name} top`).toBeGreaterThan(0);
      expect(box[2], `${name} right`).toBeLessThan(png.width - 1);
      expect(box[3], `${name} bottom`).toBeLessThan(png.height - 1);
    }
  });

  it('every state is registered to the same body position', () => {
    // The defect this pins was permanent, not transient, and no existing test could see it: the states
    // were rendered from separate poses whose bodies sit at different heights in the frame, while every
    // simulation constant was tuned against idle. A starving fish had 4.25 px of belly drawn inside the
    // gravel and a dead one 9.25 px of tail drawn ABOVE the waterline -- the precise failure the water
    // clamp exists to prevent, arriving through the art rather than through the geometry.
    const centroid = (file: string): { x: number; y: number } => {
      const png = load(file);
      let sx = 0;
      let sy = 0;
      let sa = 0;
      for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
          const a = png.data[(y * png.width + x) * 4 + 3] ?? 0;
          sx += x * a;
          sy += y * a;
          sa += a;
        }
      }
      return { x: sx / sa, y: sy / sa };
    };
    const meanCentroid = (name: string): { x: number; y: number } => {
      const files = stateFiles(fish.states[name] as never);
      const cs = files.map(centroid);
      return {
        x: cs.reduce((a, c) => a + c.x, 0) / cs.length,
        y: cs.reduce((a, c) => a + c.y, 0) / cs.length,
      };
    };
    const first = load(stateFiles(fish.states['idle'] as never)[0] as string);
    const scale = first.width / fish.frame[0];
    const base = meanCentroid('idle');
    for (const name of Object.keys(fish.states)) {
      const c = meanCentroid(name);
      const declared = fish.states[name]?.anchor ?? [0, 0];
      // What the art says, against what the manifest claims about it.
      const measured = [(c.x - base.x) / scale, (c.y - base.y) / scale];
      expect(declared[0], `${name} anchor x`).toBeCloseTo(measured[0] as number, 1);
      expect(declared[1], `${name} anchor y`).toBeCloseTo(measured[1] as number, 1);
    }
  });

  it('keeps the dead pose under the waterline once registered', () => {
    // The worst instance, checked end to end rather than through the anchor number: the behaviour
    // clamps a dead fish as high as its body box fits, and the art must not then hang out of the water.
    const files = stateFiles(fish.states['dead'] as never);
    const png = load(files[0] as string);
    const scale = png.width / fish.frame[0];
    const [, y0] = alphaBox(png, 0.02) as [number, number, number, number];
    const anchorY = (fish.states['dead']?.anchor ?? [0, 0])[1];
    const centre = BOWL_WATER_SHAPE.surfaceY + fish.body.h / 2;
    const drawnTop = centre - (png.height / 2 - y0) / scale - anchorY;
    // A fin may brush the surface; a tail may not hang above it by a body's worth.
    expect(BOWL_WATER_SHAPE.surfaceY - drawnTop, 'grid px of dead fish drawn above the waterline').toBeLessThan(3);
  });

  it('actually animates: consecutive frames differ', () => {
    for (const [name, def] of states) {
      const files = stateFiles(def);
      if (files.length < 2) continue;
      const a = load(files[0] as string);
      const b = load(files[Math.floor(files.length / 2)] as string);
      let moved = 0;
      let opaque = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const aa = a.data[i + 3] ?? 0;
        const ba = b.data[i + 3] ?? 0;
        if (aa > 6 || ba > 6) opaque += 1;
        if (Math.abs(aa - ba) > 12 || Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)) > 12) moved += 1;
      }
      expect(moved / Math.max(1, opaque), `${name}: fraction of the fish that moves`).toBeGreaterThan(0.02);
    }
  });
});
