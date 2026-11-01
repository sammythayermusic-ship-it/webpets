import { describe, expect, it, vi } from 'vitest';

// Pixi is a DOM/WebGL dependency and this module is otherwise pure geometry, so the sprites are
// stubbed. What is under test is where food spawns, how it falls and where it comes to rest — none of
// which needs a renderer, and all of which had no test at all until now. `food.ts` shipped with zero
// coverage, which is how it came to work only in water while a second habitat was added around it.
vi.mock('pixi.js', () => {
  // Only what this module's import graph touches: the flake sprites and the crumb texture that
  // `fx.paintTexture` builds. Everything under test is geometry, so nothing needs a real renderer.
  class Container {
    children: unknown[] = [];
    constructor(_o?: unknown) {}
    addChild(c: unknown): void { this.children.push(c); }
    destroy(): void {}
  }
  class Sprite {
    position = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } };
    scale = { set(_n: number) {} };
    alpha = 1;
    constructor(_o?: unknown) {}
    destroy(): void {}
  }
  return {
    Container,
    Sprite,
    Texture: class { constructor(_o?: unknown) {} },
    BufferImageSource: class { constructor(_o?: unknown) {} },
    Graphics: class {},
  };
});

const { createFlakes, FLAKES_PER_FEED } = await import('./food');
const { makeFloorBounds, makeWaterBounds } = await import('./water');
const { BOWL_WATER_SHAPE } = await import('../species/fish/layout');
const { CAGE_FLOOR_RECT, CAGE_STAND_Y } = await import('../species/hamster/layout');

/** Deterministic rng so a settle row is a fact rather than a sample. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const waterBounds = makeWaterBounds(BOWL_WATER_SHAPE);
const floorBounds = makeFloorBounds({ rect: CAGE_FLOOR_RECT, standY: CAGE_STAND_Y });
const FLOOR_DOMAIN = { kind: 'floor', rect: CAGE_FLOOR_RECT, standY: CAGE_STAND_Y } as const;
const WATER_DOMAIN = { kind: 'water', shape: BOWL_WATER_SHAPE } as const;

/**
 * Run until every flake has stopped moving, or give up. Returns the resting positions. "Stopped" is
 * no change in whole px for a dozen steps: flakes in water float and then sink slowly, so a single
 * still step proves nothing.
 */
function settle(f: ReturnType<typeof createFlakes>, rng: () => number, maxSteps = 800): Array<{ x: number; y: number }> {
  let last = JSON.stringify(f.positions());
  let still = 0;
  for (let i = 0; i < maxSteps; i += 1) {
    f.step(rng);
    const now = JSON.stringify(f.positions());
    still = now === last ? still + 1 : 0;
    if (still >= 12) break;
    last = now;
  }
  return f.positions();
}

describe('food in water', () => {
  it('drops at the waterline and sinks to rest just above the gravel', () => {
    const rng = seeded(1);
    const f = createFlakes(WATER_DOMAIN, waterBounds);
    f.feed(rng);
    expect(f.count()).toBe(FLAKES_PER_FEED);
    for (const p of f.positions()) expect(p.y).toBeCloseTo(waterBounds.surfaceY + 2, 0);

    const rest = settle(f, rng);
    // The fish's own behaviour test hardcodes `floorY - 4` as the row it must be able to reach, so
    // this is a contract between two files and not an arbitrary constant.
    for (const p of rest) expect(p.y).toBe(waterBounds.floorY - 4);
  });

  it('drifts sideways on the way down, which is what makes a feed look scattered', () => {
    const rng = seeded(4);
    const f = createFlakes(WATER_DOMAIN, waterBounds);
    f.feed(rng);
    const startXs = f.positions().map((p) => p.x);
    const rest = settle(f, rng);
    const moved = rest.filter((p, i) => p.x !== startXs[i]);
    expect(moved.length, 'no flake drifted at all').toBeGreaterThan(0);
  });

  it('drops a pinch where it is aimed, close together', () => {
    const rng = seeded(3);
    const f = createFlakes(WATER_DOMAIN, waterBounds);
    f.feed(rng, 120);
    for (const p of f.positions()) expect(Math.abs(p.x - 120), 'within the pinch').toBeLessThanOrEqual(8);
  });

  it('floats for a moment before it sinks, so there is something to chase near the surface', () => {
    const rng = seeded(5);
    const f = createFlakes(WATER_DOMAIN, waterBounds);
    f.feed(rng, 160);
    for (let i = 0; i < 6; i += 1) f.step(rng);
    for (const p of f.positions()) expect(p.y, 'still at the surface after 0.75 s').toBe(waterBounds.surfaceY + 2);
    for (let i = 0; i < 60; i += 1) f.step(rng);
    expect(Math.max(...f.positions().map((p) => p.y)), 'sinking by 8 s').toBeGreaterThan(waterBounds.surfaceY + 10);
  });

  it('keeps every flake inside the water', () => {
    const rng = seeded(9);
    const f = createFlakes(WATER_DOMAIN, waterBounds);
    f.feed(rng);
    for (let i = 0; i < 200; i += 1) {
      f.step(rng);
      for (const p of f.positions()) expect(waterBounds.inside(p.x, p.y)).toBe(true);
    }
  });
});

describe('food on a floor', () => {
  // Every case here fails against the water-only implementation, and each maps to one line of it.

  it('never rests above the ground the pet walks on', () => {
    // The bug: `Math.min(ny, floorY - 4)` on a floor habitat, where surfaceY === floorY === standY,
    // parks the seed 4 px ABOVE the animal's centre line and calls it settled on the first step.
    const rng = seeded(2);
    const f = createFlakes(FLOOR_DOMAIN, floorBounds);
    f.feed(rng);
    for (const p of settle(f, rng)) {
      expect(p.y, 'a seed resting above the bedding line is hovering').toBeGreaterThanOrEqual(CAGE_STAND_Y);
    }
  });

  it('is released above the standing line, so it visibly drops in', () => {
    // Not just "ends up low enough" — food that materialises at the animal's feet has no fall at all,
    // and reads as appearing out of nowhere. The original bug spawned it 2 px BELOW the bedding line.
    const rng = seeded(11);
    const f = createFlakes(FLOOR_DOMAIN, floorBounds);
    f.feed(rng);
    for (const p of f.positions()) {
      expect(p.y, 'food spawned at or below the pet, with nowhere to fall from').toBeLessThan(CAGE_STAND_Y);
    }
  });

  it('falls downward, never upward', () => {
    // The bug: spawning at `surfaceY + 2` puts the seed BELOW the standing line, and the first step
    // then clamps it up to `floorY - 4` — a seed that visibly jumps 6 px into the air when dropped.
    const rng = seeded(3);
    const f = createFlakes(FLOOR_DOMAIN, floorBounds);
    f.feed(rng);
    let prev = f.positions();
    for (let i = 0; i < 40; i += 1) {
      f.step(rng);
      const now = f.positions();
      now.forEach((p, k) => {
        expect(p.y, `seed ${k} rose from ${prev[k]?.y} to ${p.y}`).toBeGreaterThanOrEqual(prev[k]?.y ?? 0);
      });
      prev = now;
    }
  });

  it('scatters across the bedding rather than piling on one column', () => {
    // The bug: the spawn column comes from `halfWidthAt` on the cage's flattened ellipse (ry: 1),
    // which collapses to 0 and falls back to the `Math.max(12, ...)` floor — so all six seeds land
    // within 12 px of grid centre, nowhere near the rest of the cage.
    const rng = seeded(5);
    const f = createFlakes(FLOOR_DOMAIN, floorBounds);
    f.feed(rng);
    const xs = settle(f, rng).map((p) => p.x);
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread, `seeds spread only ${spread} px`).toBeGreaterThan(40);
  });

  it('lands inside the walkable span, so nothing is stranded through a wall', () => {
    const rng = seeded(6);
    const f = createFlakes(FLOOR_DOMAIN, floorBounds);
    f.feed(rng);
    for (const p of settle(f, rng)) {
      expect(p.x).toBeGreaterThanOrEqual(CAGE_FLOOR_RECT.x);
      expect(p.x).toBeLessThanOrEqual(CAGE_FLOOR_RECT.x + CAGE_FLOOR_RECT.w);
    }
  });

  it('does not drift sideways: seed does not blow about on bedding', () => {
    const rng = seeded(7);
    const f = createFlakes(FLOOR_DOMAIN, floorBounds);
    f.feed(rng);
    const startXs = f.positions().map((p) => p.x);
    const rest = settle(f, rng).map((p) => p.x);
    expect(rest).toEqual(startXs);
  });
});

describe('food lifecycle, which is the same in either domain', () => {
  it('dissolves settled food and reports how much went', () => {
    const rng = seeded(8);
    const f = createFlakes(FLOOR_DOMAIN, floorBounds);
    f.feed(rng);
    let dissolved = 0;
    for (let i = 0; i < 400; i += 1) dissolved += f.step(rng);
    expect(dissolved).toBe(FLAKES_PER_FEED);
    expect(f.count()).toBe(0);
  });

  it('removes by the same index positions() reports, or the wrong food is eaten', () => {
    const rng = seeded(10);
    const f = createFlakes(FLOOR_DOMAIN, floorBounds);
    f.feed(rng);
    const before = f.positions();
    f.remove(2);
    const after = f.positions();
    expect(after).toHaveLength(before.length - 1);
    expect(after).not.toContainEqual(before[2]);
  });
});
