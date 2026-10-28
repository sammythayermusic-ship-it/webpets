import { describe, expect, it } from 'vitest';
import { cycleMs, frameAt, wrapMs } from './frameClock';

describe('frameAt', () => {
  it('advances one frame every 1000/fps ms', () => {
    expect(frameAt(0, 96, 24, true)).toBe(0);
    expect(frameAt(41, 96, 24, true)).toBe(0);
    expect(frameAt(42, 96, 24, true)).toBe(1);
    expect(frameAt(1000, 96, 24, true)).toBe(24);
  });

  it('loops back to the first frame after the last', () => {
    expect(frameAt(3999, 96, 24, true)).toBe(95);
    expect(frameAt(4000, 96, 24, true)).toBe(0);
    expect(frameAt(4000 * 7 + 500, 96, 24, true)).toBe(12);
  });

  it('holds the last frame of a one-shot', () => {
    expect(frameAt(10_000, 8, 24, false)).toBe(7);
    expect(frameAt(300, 8, 24, false)).toBe(7);
    expect(frameAt(290, 8, 24, false)).toBe(6);
  });

  it('never throws on nonsense: it shows frame 0', () => {
    expect(frameAt(Number.NaN, 96, 24, true)).toBe(0);
    expect(frameAt(-5, 96, 24, true)).toBe(0);
    expect(frameAt(500, 0, 24, true)).toBe(0);
    expect(frameAt(500, 1, 24, true)).toBe(0);
    expect(frameAt(500, 96, 0, true)).toBe(0);
  });

  it('lands on the wall-clock frame after a stall rather than replaying the gap', () => {
    // 2.5 s of nothing, then one call: the frame is the one 2.5 s in, not frame 1.
    expect(frameAt(2500, 96, 24, true)).toBe(60);
  });
});

describe('cycle helpers', () => {
  it('cycleMs is frames over fps', () => {
    expect(cycleMs(96, 24)).toBe(4000);
    expect(cycleMs(96, 0)).toBe(0);
  });

  it('wrapMs keeps the phase while bounding the accumulator', () => {
    expect(wrapMs(3999, 96, 24)).toBe(3999);
    expect(wrapMs(4000, 96, 24)).toBe(0);
    expect(wrapMs(9500, 96, 24)).toBe(1500);
    expect(frameAt(wrapMs(9500, 96, 24), 96, 24, true)).toBe(frameAt(9500, 96, 24, true));
  });
});
