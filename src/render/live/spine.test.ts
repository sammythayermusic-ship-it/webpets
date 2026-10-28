import { describe, expect, it } from 'vitest';
import { createSpine, type SpineInput, type SpineState } from './spine';

const rng = (): number => 0.5;

function run(spine: ReturnType<typeof createSpine>, frames: number, make: (i: number) => Omit<SpineInput, 'dtMs' | 'rng'>, dtMs = 16): SpineState {
  let s = spine.state();
  for (let i = 0; i < frames; i += 1) s = spine.update({ dtMs, rng, ...make(i) });
  return s;
}

describe('procedural spine', () => {
  it('beats harder and faster the faster the fish swims', () => {
    const slow = createSpine();
    slow.reset(100, 100, 1);
    const sSlow = run(slow, 90, (i) => ({ x: 100 + i * 0.05, y: 100, facing: 1, anim: 'idle' }));
    const fast = createSpine();
    fast.reset(100, 100, 1);
    const sFast = run(fast, 90, (i) => ({ x: 100 + i * 0.8, y: 100, facing: 1, anim: 'idle' }));
    expect(sFast.speed).toBeGreaterThan(sSlow.speed * 5);
    expect(sFast.amp).toBeGreaterThan(sSlow.amp);
    expect(sFast.beatHz).toBeGreaterThan(sSlow.beatHz);
    expect(sFast.amp).toBeLessThanOrEqual(0.014);
    expect(sFast.beatHz).toBeLessThanOrEqual(4.2);
  });

  it('turns through a real yaw when the facing flips, and curls into the turn while it does', () => {
    const spine = createSpine();
    spine.reset(100, 100, 1);
    expect(spine.state().yaw).toBe(0);
    let maxCurl = 0;
    let s = spine.state();
    for (let i = 0; i < 40; i += 1) {
      s = spine.update({ dtMs: 16, rng, x: 100, y: 100, facing: -1, anim: 'idle' });
      maxCurl = Math.max(maxCurl, Math.abs(s.turn));
      if (i === 4) {
        // mid-turn: neither pose yet
        expect(s.yaw).toBeGreaterThan(0.2);
        expect(s.yaw).toBeLessThan(Math.PI - 0.2);
      }
    }
    expect(s.yaw).toBeCloseTo(Math.PI, 1);
    expect(maxCurl).toBeGreaterThan(0.004);
    // and the curl relaxes once the turn is done
    expect(Math.abs(s.turn)).toBeLessThan(maxCurl * 0.2);
  });

  it('rolls belly-up when dead and stops beating', () => {
    const spine = createSpine();
    spine.reset(100, 100, 1);
    const s = run(spine, 240, () => ({ x: 100, y: 100, facing: 1, anim: 'dead' }));
    expect(s.roll).toBeCloseTo(Math.PI, 1);
    expect(s.amp).toBe(0);
    expect(s.beatHz).toBe(0);
  });

  it('opens the mouth on a bite and closes it again', () => {
    const spine = createSpine();
    spine.reset(100, 100, 1);
    run(spine, 10, () => ({ x: 100, y: 100, facing: 1, anim: 'idle' }));
    let peak = 0;
    let s = spine.state();
    for (let i = 0; i < 60; i += 1) {
      s = spine.update({ dtMs: 16, rng, x: 100, y: 100, facing: 1, anim: i < 30 ? 'eat' : 'idle' });
      peak = Math.max(peak, s.mouth);
    }
    expect(peak).toBeGreaterThan(0.5);
    expect(s.mouth).toBeLessThan(0.1);
  });

  it('pitches the nose along the direction of travel', () => {
    const up = createSpine();
    up.reset(100, 120, 1);
    // climbing on screen = y decreasing; nose should pitch UP (positive)
    const sUp = run(up, 60, (i) => ({ x: 100 + i * 0.6, y: 120 - i * 0.6, facing: 1, anim: 'idle' }));
    expect(sUp.pitch).toBeGreaterThan(0.08);
    const down = createSpine();
    down.reset(100, 80, 1);
    const sDown = run(down, 60, (i) => ({ x: 100 + i * 0.6, y: 80 + i * 0.6, facing: 1, anim: 'idle' }));
    expect(sDown.pitch).toBeLessThan(-0.08);
  });

  it('sleeps with a slow sway and a faint beat', () => {
    const spine = createSpine();
    spine.reset(100, 100, 1);
    const s = run(spine, 60, () => ({ x: 100, y: 100, facing: 1, anim: 'sleep' }));
    expect(s.sway).toBeGreaterThan(0);
    expect(s.beatHz).toBeLessThan(0.6);
    expect(s.amp).toBeLessThan(0.002);
  });

  it('reset snaps the yaw with no turn', () => {
    const spine = createSpine();
    spine.reset(50, 50, -1);
    expect(spine.state().yaw).toBe(Math.PI);
    const s = spine.update({ dtMs: 16, rng, x: 50, y: 50, facing: -1, anim: 'idle' });
    expect(Math.abs(s.turn)).toBeLessThan(1e-9);
  });
});
