import { describe, expect, it } from 'vitest';
import { createSpine, spiritsFor, type SpineInput, type SpineState } from './spine';

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

describe('body language (step C)', () => {
  const still = (act?: string, spirits?: number, facing: 1 | -1 = 1) => (): Omit<SpineInput, 'dtMs' | 'rng'> => ({
    x: 100,
    y: 100,
    facing,
    anim: 'idle',
    ...(act ? { act } : {}),
    ...(spirits !== undefined ? { spirits } : {}),
  });

  it('hovers on its pectorals: they scull hard while the tail almost stops', () => {
    const hover = createSpine();
    hover.reset(100, 100, 1);
    const h = run(hover, 120, still('hover'));
    const cruise = createSpine();
    cruise.reset(100, 100, 1);
    const c = run(cruise, 120, (i) => ({ x: 100 + i * 0.5, y: 100, facing: 1, anim: 'idle' }));
    expect(h.scull).toBeGreaterThan(0.9);
    expect(c.scull).toBeLessThan(h.scull);
    expect(h.amp).toBeLessThan(c.amp);
  });

  it('pecks nose-down, gulps nose-up, and opens the mouth for each', () => {
    const peck = createSpine();
    peck.reset(100, 100, 1);
    let maxMouth = 0;
    let s = peck.state();
    for (let i = 0; i < 40; i += 1) {
      s = peck.update({ dtMs: 16, rng, ...still('peck')() });
      maxMouth = Math.max(maxMouth, s.mouth);
    }
    expect(s.pitch).toBeLessThan(-0.4);
    expect(maxMouth).toBeGreaterThan(0.4);
    const gulp = createSpine();
    gulp.reset(100, 100, 1);
    expect(run(gulp, 60, still('gulp')).pitch).toBeGreaterThan(0.3);
  });

  it('turns its face toward the viewer to look, whichever way it was facing', () => {
    for (const facing of [1, -1] as const) {
      const sp = createSpine();
      sp.reset(100, 100, facing);
      const s = run(sp, 90, still('look', undefined, facing));
      // nose direction in the camera frame: z toward the viewer is -sin(yaw)
      expect(-Math.sin(s.yaw), `facing ${facing}`).toBeGreaterThan(0.6);
    }
  });

  it('reads its spirits off the mood: folded when unwell or hungry, fanned when excited', () => {
    expect(spiritsFor('content', 'idle', 'full', false)).toBe(0.5);
    expect(spiritsFor('excited', 'idle', 'full', true)).toBeGreaterThan(1.15);
    expect(spiritsFor('happy', 'excited', 'full', true)).toBeGreaterThan(1.2);
    expect(spiritsFor('happy', 'idle', 'hungry', true)).toBeLessThanOrEqual(0.75);
    expect(spiritsFor('content', 'idle', 'starving', true)).toBeLessThan(0.6);
    expect(spiritsFor('miserable', 'idle', 'full', true)).toBeLessThan(0.7);
    expect(spiritsFor('content', 'idle', 'full', true)).toBe(1);
  });

  it('folds its fins when low and spreads them when excited', () => {
    const low = createSpine();
    low.reset(100, 100, 1);
    const high = createSpine();
    high.reset(100, 100, 1);
    expect(run(low, 200, still(undefined, 0.6)).spread).toBeLessThan(0.7);
    expect(run(high, 200, still(undefined, 1.2)).spread).toBeGreaterThan(1.1);
  });
});
