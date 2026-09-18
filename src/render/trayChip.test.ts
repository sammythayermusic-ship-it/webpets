import { describe, expect, it } from 'vitest';
import { CHIP_RING_COLORS, paintTrayChip } from './trayChip';
import type { SceneView } from './types';

function view(over: Partial<SceneView> = {}): SceneView {
  return {
    species: 'fish',
    habitat: 'bowl',
    personality: 'zen',
    lastFedAt: 0,
    hunger: 100,
    label: 'full',
    alive: true,
    phase: 'alive',
    pantryFraction: 1,
    pantryLow: false,
    night: false,
    reducedMotion: false,
    asleep: false,
    ...over,
  };
}

function px(buf: Uint8Array, size: number, x: number, y: number): [number, number, number, number] {
  const i = (y * size + x) * 4;
  return [buf[i] ?? -1, buf[i + 1] ?? -1, buf[i + 2] ?? -1, buf[i + 3] ?? -1];
}

function countColor(buf: Uint8Array, rgb: readonly [number, number, number, number], alpha = 255): number {
  let n = 0;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i] === rgb[0] && buf[i + 1] === rgb[1] && buf[i + 2] === rgb[2] && buf[i + 3] === alpha) n += 1;
  }
  return n;
}

describe('paintTrayChip', () => {
  it('returns size*size*4 bytes for both sizes', () => {
    expect(paintTrayChip(view(), 18).length).toBe(18 * 18 * 4);
    expect(paintTrayChip(view(), 36).length).toBe(36 * 36 * 4);
  });

  it('leaves the corners transparent', () => {
    const b = paintTrayChip(view(), 18);
    expect(px(b, 18, 0, 0)[3]).toBe(0);
    expect(px(b, 18, 17, 17)[3]).toBe(0);
    expect(px(b, 18, 17, 0)[3]).toBe(0);
  });

  it('colors the ring by label and lights it by hunger', () => {
    const full = paintTrayChip(view({ hunger: 100, label: 'full' }), 18);
    const half = paintTrayChip(view({ hunger: 50, label: 'peckish' }), 18);
    const low = paintTrayChip(view({ hunger: 10, label: 'hungry' }), 18);
    const zero = paintTrayChip(view({ hunger: 0, label: 'starving' }), 18);
    const fullLit = countColor(full, CHIP_RING_COLORS.full);
    const halfLit = countColor(half, CHIP_RING_COLORS.peckish);
    const lowLit = countColor(low, CHIP_RING_COLORS.hungry);
    expect(fullLit).toBeGreaterThan(30);
    expect(halfLit).toBeGreaterThan(fullLit * 0.35);
    expect(halfLit).toBeLessThan(fullLit * 0.65);
    expect(lowLit).toBeGreaterThan(0);
    expect(lowLit).toBeLessThan(halfLit);
    expect(countColor(zero, CHIP_RING_COLORS.starving)).toBe(0);
    // The unlit part still carries the label color, dimmed, so a starving chip reads red.
    expect(countColor(zero, CHIP_RING_COLORS.starving, 70)).toBeGreaterThan(30);
    expect(countColor(full, CHIP_RING_COLORS.peckish)).toBe(0);
  });

  it('draws an orange fish when alive and a gray one when dead', () => {
    const alive = paintTrayChip(view(), 18);
    const dead = paintTrayChip(view({ alive: false, phase: 'dead', hunger: 0, label: 'starving' }), 18);
    expect(countColor(alive, [255, 140, 40, 255])).toBeGreaterThan(10);
    expect(countColor(dead, [255, 140, 40, 255])).toBe(0);
    expect(countColor(dead, [150, 150, 160, 255])).toBeGreaterThan(10);
  });

  it('36 px is an exact 2x nearest upscale of 18 px', () => {
    const small = paintTrayChip(view({ hunger: 42, label: 'peckish' }), 18);
    const big = paintTrayChip(view({ hunger: 42, label: 'peckish' }), 36);
    for (let y = 0; y < 36; y += 1) {
      for (let x = 0; x < 36; x += 1) {
        expect(px(big, 36, x, y)).toEqual(px(small, 18, x >> 1, y >> 1));
      }
    }
  });

  it('is deterministic', () => {
    const a = paintTrayChip(view({ hunger: 77 }), 18);
    const b = paintTrayChip(view({ hunger: 77 }), 18);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
