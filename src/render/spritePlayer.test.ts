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
      // A locomotor state: one full cycle carries the pet 16 grid px over 4 sequence steps, so a
      // frame is due every 4 px of ground, whatever the clock is doing.
      walk: { source: { kind: 'strip', file: 'idle.png' }, frames, sequence: [0, 1, 2, 3], loop: true, stridePx: 16 },
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

/**
 * The stride clock. A walk is not a thing that happens at a rate, it is a thing that happens per unit
 * of ground -- and the hamster's ground speed is 2.2, 1.4 or 0.3 px per tick depending on how hungry
 * it is. A time-driven cycle covers three different distances at those speeds, which is the sliding
 * this replaces. Everything below is about the frame clock ignoring the wall clock entirely.
 */
describe('a state with no art at all', () => {
  it('still animates, rather than locking on one still frame', () => {
    // The hamster has no happy/excited/curious art, but `moodAnim()` asks for those states by name
    // for EVERY species -- there is no capability check at the call site. With no art and no fallback
    // sequence the sequencer's frame index never advances, so the player holds `idle_0001` and the
    // animal stops breathing and blinking until something moves it. No crash, no warning.
    //
    // It is not hypothetical: a content, well-fed hamster standing still computes `happy` easily, and
    // the whole wheel errand reports a stationary pose too.
    const p = makePlayer({ fps: 12 });
    p.play('happy');
    expect(p.state()).toBe('happy');
    const poses = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      p.advance(90); // over one art frame at 12 fps
      poses.add(`${p.sprite.position.y.toFixed(3)}|${p.sprite.scale.y.toFixed(3)}`);
    }
    expect(poses.size, 'an artless state froze instead of falling back to a bob').toBeGreaterThan(1);
  });
});

describe('stride clock, for states that declare a stridePx', () => {
  it('does not advance on time alone, however long it is given', () => {
    const p = makePlayer({ fps: 12 });
    p.play('walk');
    const before = p.sprite.texture;
    // 250 ms is three frames at 12 fps, deliberately NOT a whole number of 4-frame cycles. A round
    // 5000 ms would spin the stall ceiling's 16 steps and land back on frame 0, so a time-driven
    // regression would slip through looking identical.
    p.advance(250, 0);
    expect(p.sprite.texture, 'a walk with nowhere to walk is a stand').toBe(before);
    p.advance(5_000, 0);
    expect(p.sprite.texture, 'still standing, however long it waits').toBe(before);
  });

  it('advances one frame per stridePx / steps of ground', () => {
    const p = makePlayer({ fps: 12 });
    p.play('walk');
    const before = p.sprite.texture;
    p.advance(16, 3.9);
    expect(p.sprite.texture, 'just under one frame of ground').toBe(before);
    p.advance(16, 0.2); // 4.1 px total, past the 4 px frame
    expect(p.sprite.texture).not.toBe(before);
  });

  it('covers the same ground per frame at any speed, which is the whole point', () => {
    // The same 18 px of travel, delivered as one fast tick or 36 slow ones over 30x the wall time,
    // must land on the same frame. If this fails the feet slide at some speeds and not others.
    //
    // The increment is 0.5 rather than a prettier 0.4 because 0.5 is exactly representable in binary
    // and 0.4 is not: ten additions of 0.4 make 3.9999999999999996, which sits just under a 4 px frame
    // boundary and drops a step. That is a property of the test's arithmetic, not of the player -- the
    // accumulator subtracts the stride exactly, so the error is bounded at one ULP and never compounds
    // -- but it would make this test a coin flip on where the boundaries happen to fall.
    const fast = makePlayer({ fps: 12 });
    fast.play('walk');
    fast.advance(125, 18);

    const slow = makePlayer({ fps: 12 });
    slow.play('walk');
    for (let i = 0; i < 36; i += 1) slow.advance(500, 0.5);

    // Compared by the strip offset, not by texture identity: each player builds its OWN Texture
    // objects over the strip, so two players can never share one however equal their frames are.
    expect(slow.sprite.texture.frame.x).toBe(fast.sprite.texture.frame.x);
  });

  it('keeps the turn tween on the wall clock, since turning on the spot covers no ground', () => {
    const p = makePlayer({ fps: 12 });
    p.play('walk');
    p.setFacing(-1, true);
    const mid = p.sprite.scale.x;
    p.advance(TURN_MS, 0); // no distance at all
    expect(p.sprite.scale.x, 'the turn finished on time despite zero travel').not.toBeCloseTo(mid, 5);
  });

  it('cannot spin the sequencer when a teleport hands it a huge distance', () => {
    const p = makePlayer({ fps: 12 });
    p.play('walk');
    expect(() => p.advance(16, 100_000)).not.toThrow();
    expect(p.state()).toBe('walk');
  });

  it('resetPose clears banked ground, so a new pet does not inherit the old one\'s step', () => {
    const p = makePlayer({ fps: 12 });
    p.play('walk');
    p.advance(16, 3.9); // nearly a frame banked
    p.resetPose(10, 10, 1);
    const before = p.sprite.texture;
    p.advance(16, 0.2); // would step if the 3.9 px had survived the handover
    expect(p.sprite.texture).toBe(before);
  });

  it('ignores distance for a state that did not ask for it', () => {
    const p = makePlayer({ fps: 12 });
    expect(p.state()).toBe('idle');
    const before = p.sprite.texture;
    p.advance(0, 500); // half a screen of travel, on a time-driven state
    expect(p.sprite.texture, 'idle breathes at a rate, not per metre').toBe(before);
  });

  it('starts a fresh stride on a state change, so a stop and start does not half-step', () => {
    const p = makePlayer({ fps: 12 });
    p.play('walk');
    p.advance(16, 3.9); // most of a frame banked
    p.play('idle');
    p.play('walk');
    const before = p.sprite.texture;
    p.advance(16, 3.9); // would step if the old 3.9 had been kept
    expect(p.sprite.texture).toBe(before);
  });
});
