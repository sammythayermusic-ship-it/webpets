import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPEED,
  DEFAULT_TURN,
  alongArc,
  angleDiff,
  approachSpeed,
  arc,
  arcHeading,
  dartSpeed,
  facingOf,
  headingVec,
  noise1,
  stoppingDistance,
  ticksToSlow,
  turn,
  type Heading,
} from './motion';

describe('noise1', () => {
  it('is deterministic in its seed and bounded', () => {
    for (let t = 0; t < 200; t += 0.37) {
      const v = noise1(42, t);
      expect(v).toBe(noise1(42, t));
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
    expect(noise1(1, 12.5)).not.toBe(noise1(2, 12.5));
  });

  it('is continuous: a small step never jumps', () => {
    for (let t = 0; t < 100; t += 0.05) {
      expect(Math.abs(noise1(7, t + 0.01) - noise1(7, t))).toBeLessThan(0.05);
    }
  });

  it('does not repeat over a long run, which is what "no visible loop" means', () => {
    const a: number[] = [];
    for (let t = 0; t < 400; t++) a.push(noise1(3, t * 0.25));
    const window = 40;
    const first = a.slice(0, window);
    for (let off = window; off + window <= a.length; off += window) {
      const seg = a.slice(off, off + window);
      const diff = seg.reduce((s, v, i) => s + Math.abs(v - (first[i] ?? 0)), 0) / window;
      expect(diff).toBeGreaterThan(0.05);
    }
  });

  it('is not a plain sine: it has texture', () => {
    // A sine's second difference is proportional to its value everywhere; noise's is not.
    const vals: number[] = [];
    for (let t = 0; t < 50; t += 0.1) vals.push(noise1(11, t));
    let ratioSpread = 0;
    const ratios: number[] = [];
    for (let i = 1; i < vals.length - 1; i++) {
      const v = vals[i] ?? 0;
      if (Math.abs(v) > 0.2) ratios.push(((vals[i + 1] ?? 0) - 2 * v + (vals[i - 1] ?? 0)) / v);
    }
    const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    ratioSpread = Math.sqrt(ratios.reduce((s, r) => s + (r - mean) ** 2, 0) / ratios.length);
    expect(ratioSpread).toBeGreaterThan(1e-4);
  });
});

describe('arc', () => {
  it('starts at a, ends at b, and bows sideways by the bulge at its middle', () => {
    const k = arc({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
    expect(alongArc(k, 0)).toEqual({ x: 0, y: 0 });
    expect(alongArc(k, k.length)).toEqual({ x: 100, y: 0 });
    const mid = alongArc(k, k.length / 2);
    expect(mid.x).toBeCloseTo(50, 0);
    // A quadratic bezier reaches half its control offset at u = 0.5.
    expect(mid.y).toBeCloseTo(10, 0);
    expect(k.length).toBeGreaterThan(100);
    expect(k.length).toBeLessThan(110);
  });

  it('a zero bulge is the straight chord, length exactly the distance', () => {
    const k = arc({ x: 3, y: 4 }, { x: 33, y: 44 }, 0);
    expect(k.length).toBeCloseTo(50, 9);
    const p = alongArc(k, 25);
    expect(p.x).toBeCloseTo(18, 6);
    expect(p.y).toBeCloseTo(24, 6);
  });

  it('samples by arc length: equal distance steps cover equal distances along the curve', () => {
    const k = arc({ x: 0, y: 0 }, { x: 80, y: 40 }, -35);
    const steps = 16;
    const lens: number[] = [];
    let prev = alongArc(k, 0);
    for (let i = 1; i <= steps; i++) {
      const p = alongArc(k, (k.length * i) / steps);
      lens.push(Math.hypot(p.x - prev.x, p.y - prev.y));
      prev = p;
    }
    const mean = lens.reduce((s, v) => s + v, 0) / lens.length;
    for (const l of lens) expect(Math.abs(l - mean) / mean).toBeLessThan(0.12);
  });

  it('clamps outside the ends and survives a zero-length arc', () => {
    const k = arc({ x: 10, y: 10 }, { x: 10, y: 10 }, 15);
    expect(k.length).toBe(0);
    expect(alongArc(k, 5)).toEqual({ x: 10, y: 10 });
    expect(arcHeading(k, 0)).toEqual({ x: 1, y: 0 });
    const s = arc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0);
    expect(alongArc(s, -5)).toEqual({ x: 0, y: 0 });
    expect(alongArc(s, 50)).toEqual({ x: 10, y: 0 });
  });

  it('reports a unit heading that turns along the curve', () => {
    const k = arc({ x: 0, y: 0 }, { x: 100, y: 0 }, 30);
    const h0 = arcHeading(k, 0);
    const h1 = arcHeading(k, k.length);
    expect(Math.hypot(h0.x, h0.y)).toBeCloseTo(1, 6);
    expect(h0.y).toBeGreaterThan(0.1); // leaving upward (toward the bulge)
    expect(h1.y).toBeLessThan(-0.1); // arriving back down
  });
});

describe('dartSpeed', () => {
  it('peaks at once and bleeds to a tenth over its duration', () => {
    expect(dartSpeed(0, 6, 12)).toBe(6);
    expect(dartSpeed(12, 6, 12)).toBeCloseTo(0.6, 9);
    expect(dartSpeed(6, 6, 12)).toBeCloseTo(6 * Math.sqrt(0.1), 9);
    expect(dartSpeed(-1, 6, 12)).toBe(0);
    expect(dartSpeed(3, 6, 0)).toBe(0);
  });
});

describe('heading', () => {
  it('angleDiff takes the short way round', () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
    expect(angleDiff(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(-0.2, 9);
    expect(angleDiff(Math.PI, 0)).toBeCloseTo(Math.PI, 9);
  });

  it('turns build up, overshoot a little, and settle on the target', () => {
    let h: Heading = { angle: 0, rate: 0 };
    const target = Math.PI / 2;
    const rates: number[] = [];
    let maxAngle = 0;
    for (let i = 0; i < 60; i++) {
      h = turn(h, target);
      rates.push(Math.abs(h.rate));
      maxAngle = Math.max(maxAngle, h.angle);
    }
    expect(rates[1]).toBeGreaterThan(rates[0] ?? 0); // builds
    expect(maxAngle).toBeGreaterThan(target); // overshoots
    expect(maxAngle - target).toBeLessThan(0.25); // a touch, not a swing
    expect(angleDiff(h.angle, target)).toBeCloseTo(0, 2); // settles
    expect(Math.abs(h.rate)).toBeLessThan(0.01);
  });

  it('never turns faster than the cap: a reversal is a sweep', () => {
    let h: Heading = { angle: 0, rate: 0 };
    let ticks = 0;
    while (Math.abs(angleDiff(h.angle, Math.PI)) > 0.05 && ticks < 100) {
      h = turn(h, Math.PI);
      expect(Math.abs(h.rate)).toBeLessThanOrEqual(DEFAULT_TURN.maxRate + 1e-12);
      ticks++;
    }
    expect(ticks).toBeGreaterThanOrEqual(Math.ceil(Math.PI / DEFAULT_TURN.maxRate));
    expect(ticks).toBeLessThan(40);
  });

  it('headingVec is unit and facing has a dead zone around vertical', () => {
    const v = headingVec({ angle: 1.1, rate: 0 });
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 9);
    expect(facingOf({ angle: 0.2, rate: 0 }, -1)).toBe(1);
    expect(facingOf({ angle: Math.PI - 0.2, rate: 0 }, 1)).toBe(-1);
    expect(facingOf({ angle: Math.PI / 2, rate: 0 }, -1)).toBe(-1);
    expect(facingOf({ angle: Math.PI / 2 + 0.1, rate: 0 }, 1)).toBe(1);
  });
});

describe('speed with inertia', () => {
  it('accelerates faster than it decelerates and never overshoots the target', () => {
    let v = 0;
    const up: number[] = [];
    while (v < 3) {
      v = approachSpeed(v, 3);
      up.push(v);
    }
    expect(v).toBe(3);
    const down: number[] = [];
    while (v > 0) {
      v = approachSpeed(v, 0);
      down.push(v);
    }
    expect(v).toBe(0);
    expect(down.length).toBeGreaterThan(up.length);
    expect(up.length).toBe(Math.ceil(3 / DEFAULT_SPEED.accel));
    expect(down.length).toBe(ticksToSlow(3, 0));
  });

  it('stopping distance is the sum of the bleed', () => {
    const d = stoppingDistance(2.4);
    expect(d).toBeGreaterThan(0);
    let v = 2.4;
    let sum = 0;
    while (v > 0) {
      v = approachSpeed(v, 0);
      sum += v;
    }
    expect(d).toBeCloseTo(sum, 9);
    expect(ticksToSlow(1, 2)).toBe(0);
  });
});
