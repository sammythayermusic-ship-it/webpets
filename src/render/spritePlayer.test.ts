import { describe, expect, it } from 'vitest';
import { BufferImageSource, Texture } from 'pixi.js';
import { createSpritePlayer } from './spritePlayer';
import type { ManifestSprite } from './types';

/**
 * These pin the three-clock split that replaced pixel-perfect stepping. Nothing else in the suite can
 * see it: the behaviour tests reason in ticks and the art tests in pixels, so a regression here — a
 * reinstated Math.round, a frame clock accidentally retied to PET_FPS — would be invisible until
 * someone watched the fish and said it looked wrong.
 */

/** A texture of a given size, with no GPU involved. */
function tex(w: number, h: number): Texture {
  const source = new BufferImageSource({ resource: new Uint8Array(w * h * 4), width: w, height: h, format: 'rgba8unorm' });
  return new Texture({ source });
}

const TURN_MS = 125;

function makePlayer(opts: { frame?: [number, number]; fps?: number; texW?: number; frames?: number } = {}) {
  const frame = opts.frame ?? [80, 80];
  const frames = opts.frames ?? 4;
  const texW = opts.texW ?? frame[0] * frames; // 1x art by default
  const def: ManifestSprite = {
    frame,
    ...(opts.fps === undefined ? {} : { fps: opts.fps }),
    body: { w: 56, h: 46 },
    states: {
      idle: { source: { kind: 'strip', file: 'idle.png' }, frames, sequence: [0, 1, 2, 3], loop: true },
    },
  };
  const textures = new Map([['idle.png', tex(texW, texW / frames)]]);
  return createSpritePlayer(def, textures, { turnMs: TURN_MS });
}

describe('position', () => {
  it('draws at fractional grid positions, because rounding is what made motion look stepped', () => {
    const p = makePlayer();
    p.setPosition(10.25, 20.75);
    expect(p.sprite.position.x).toBeCloseTo(10.25, 5);
    expect(p.sprite.position.y).toBeCloseTo(20.75, 5);
  });

  it('resetPose places without a turn tween, so a new pet never slides in or spins', () => {
    const p = makePlayer();
    p.setFacing(-1, true); // start a flip
    p.resetPose(100, 50, 1);
    expect(p.sprite.position.x).toBeCloseTo(100, 5);
    // Mid-tween scale.x would be somewhere near zero; a reset must land on the full facing at once.
    expect(Math.abs(p.sprite.scale.x)).toBeCloseTo(1, 5);
  });
});

describe('art scale', () => {
  it('draws a frame at its LOGICAL size whatever resolution the art was rendered at', () => {
    // 4x art: an 80px logical frame stored as 320px cells. The drawn width must not change.
    const oneX = makePlayer({ frame: [80, 80], texW: 80 * 4 });
    const fourX = makePlayer({ frame: [80, 80], texW: 320 * 4 });
    expect(Math.abs(oneX.sprite.scale.x)).toBeCloseTo(1, 5);
    expect(Math.abs(fourX.sprite.scale.x)).toBeCloseTo(0.25, 5);
    expect(oneX.sprite.width).toBeCloseTo(fourX.sprite.width, 5);
  });
});

describe('turning', () => {
  it('sweeps through zero width rather than snapping, and lands exactly on the new facing', () => {
    const p = makePlayer();
    expect(p.sprite.scale.x).toBeCloseTo(1, 5);
    p.setFacing(-1, true);
    p.advance(TURN_MS / 2);
    // Halfway through a cos sweep from +1 is 0: the fish is edge-on, which IS the turn.
    expect(Math.abs(p.sprite.scale.x)).toBeLessThan(0.05);
    p.advance(TURN_MS / 2);
    expect(p.sprite.scale.x).toBeCloseTo(-1, 5);
  });

  it('ignores a repeated facing, so the several rendered frames inside one tick cannot restart it', () => {
    const p = makePlayer();
    p.setFacing(-1, true);
    p.advance(TURN_MS * 0.75);
    const mid = p.sprite.scale.x;
    p.setFacing(-1, false); // same facing again, as every frame of the tick would
    expect(p.sprite.scale.x).toBeCloseTo(mid, 5);
  });
});

describe('frame clock', () => {
  it('advances at the art fps, not at the simulation tick rate', () => {
    const p = makePlayer({ fps: 12 });
    // 12 fps means a frame every ~83ms. A 125ms simulation tick is deliberately NOT the unit here.
    expect(p.state()).toBe('idle');
    const before = p.sprite.texture;
    p.advance(40);
    expect(p.sprite.texture, 'less than one art frame elapsed').toBe(before);
    p.advance(50); // 90ms total, past one frame at 12 fps
    expect(p.sprite.texture).not.toBe(before);
  });

  it('cannot spin the sequencer when a stall hands it a huge dt', () => {
    const p = makePlayer({ fps: 12 });
    expect(() => p.advance(60_000)).not.toThrow();
    expect(p.state()).toBe('idle');
  });
});
