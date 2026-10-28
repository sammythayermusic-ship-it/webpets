import { describe, expect, it } from 'vitest';
import { lightRig, warmth } from './daynight';

const len = (v: [number, number, number]): number => Math.hypot(v[0], v[1], v[2]);

describe('warmth', () => {
  it('is neutral at midday and warm at dawn and dusk', () => {
    expect(warmth(12)).toBe(0);
    expect(warmth(13.5)).toBe(0);
    expect(warmth(7)).toBeGreaterThan(0.6);
    expect(warmth(18.5)).toBeGreaterThan(0.6);
    expect(warmth(7)).toBeCloseTo(warmth(17), 9);
  });

  it('wraps the hour', () => {
    expect(warmth(31)).toBeCloseTo(warmth(7), 9);
    expect(warmth(-5)).toBeCloseTo(warmth(19), 9);
  });
});

describe('lightRig', () => {
  it('is dimmer and bluer at night than by day', () => {
    const day = lightRig(12, 0);
    const night = lightRig(12, 1);
    expect(night.key.intensity).toBeLessThan(day.key.intensity);
    expect(night.fill.intensity).toBeLessThan(day.fill.intensity);
    expect(night.hemiIntensity).toBeLessThan(day.hemiIntensity);
    expect(night.envIntensity).toBeLessThan(day.envIntensity);
    expect(night.caustic).toBeLessThan(day.caustic);
    // Blue over red at night, red over blue by day.
    expect(night.key.color[2]).toBeGreaterThan(night.key.color[0]);
    expect(day.key.color[0]).toBeGreaterThan(day.key.color[2]);
  });

  it('blends continuously between the two', () => {
    const a = lightRig(12, 0).key.intensity;
    const b = lightRig(12, 0.5).key.intensity;
    const c = lightRig(12, 1).key.intensity;
    expect(b).toBeCloseTo((a + c) / 2, 9);
  });

  it('keeps every direction a unit vector, and the key above the bowl', () => {
    for (const [h, n] of [
      [12, 0],
      [7, 0],
      [19, 0.5],
      [3, 1],
    ] as const) {
      const rig = lightRig(h, n);
      expect(len(rig.key.direction)).toBeCloseTo(1, 9);
      expect(len(rig.fill.direction)).toBeCloseTo(1, 9);
      expect(len(rig.rim.direction)).toBeCloseTo(1, 9);
      expect(rig.key.direction[1]).toBeLessThan(0); // travelling downward
    }
  });

  it('is warmer and lower in the evening than at noon', () => {
    const noon = lightRig(12, 0);
    const evening = lightRig(18.5, 0);
    expect(evening.key.color[2]).toBeLessThan(noon.key.color[2]);
    expect(Math.abs(evening.key.direction[1])).toBeLessThan(Math.abs(noon.key.direction[1]));
    expect(evening.key.intensity).toBeLessThan(noon.key.intensity);
  });

  it('clamps the night amount', () => {
    expect(lightRig(12, 2)).toEqual(lightRig(12, 1));
    expect(lightRig(12, -1)).toEqual(lightRig(12, 0));
  });
});
