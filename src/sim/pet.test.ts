import { describe, expect, it } from 'vitest';
import { ageMs, formatAge, newPet, toGraveRecord, NAME_POOLS } from './pet';
import { reconcile } from './reconcile';
import { B, H, mulberry32 } from './test-helpers';
import { DAY_MS } from './constants';
import type { Personality, Rarity } from './types';

describe('pet', () => {
  it('31. newPet', () => {
    const rng = mulberry32(99);
    const p = newPet(B, rng);
    expect(p.id).toMatch(/^#\d{4}$/);
    const n = Number(p.id.slice(1));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(9999);
    expect(p.lastReconciledAt).toBe(B);
    expect(p.lastFedAt).toBe(B);
    expect(p.bornAt).toBe(B);
    expect(p.hungerAtLastFed).toBe(100);
    expect(p.pantry).toBe(0);
    expect(p.meals).toBe(0);
    expect(p.feedBurned).toBe(0);
    expect(p.alive).toBe(true);
    expect('diedAt' in p).toBe(false);
    expect(p.species).toBe('fish');
    expect(p.habitat).toBe('bowl');
    expect(NAME_POOLS.fish).toContain(p.name);

    const q = newPet(B, mulberry32(5), { species: 'hamster', name: 'Waffle' });
    expect(q.species).toBe('hamster');
    expect(q.habitat).toBe('cage');
    expect(q.name).toBe('Waffle');
    const c = newPet(B, mulberry32(5), { species: 'chicken' });
    expect(c.habitat).toBe('brooder');
    expect(NAME_POOLS.chicken).toContain(c.name);

    const rarity: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const pers: Record<Personality, number> = { sarcastic: 0, anxious: 0, zen: 0, degen: 0 };
    const ids = new Set<number>();
    const r2 = mulberry32(2024);
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const x = newPet(B, r2);
      rarity[x.rarity]++;
      pers[x.personality]++;
      ids.add(Number(x.id.slice(1)));
    }
    expect(Math.abs((rarity.common / N) * 100 - 70)).toBeLessThanOrEqual(2);
    expect(Math.abs((rarity.rare / N) * 100 - 20)).toBeLessThanOrEqual(2);
    expect(Math.abs((rarity.epic / N) * 100 - 8)).toBeLessThanOrEqual(2);
    expect(Math.abs((rarity.legendary / N) * 100 - 2)).toBeLessThanOrEqual(2);
    for (const k of Object.keys(pers) as Personality[]) {
      expect(Math.abs((pers[k] / N) * 100 - 25)).toBeLessThanOrEqual(3);
    }
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(9999);
    }
  });

  it('32. ageMs / formatAge', () => {
    expect(formatAge(0)).toBe('0d 0h');
    expect(formatAge(3 * DAY_MS + 4 * H)).toBe('3d 4h');
    expect(formatAge(3 * DAY_MS + 4 * H + 59 * 60_000)).toBe('3d 4h');
    expect(formatAge(59 * 60_000)).toBe('0d 0h');
    expect(formatAge(-5)).toBe('0d 0h');
    const p = newPet(B, mulberry32(1));
    expect(ageMs(p, B + 10 * H)).toBe(10 * H);
    const dead = reconcile(p, B + 36 * H).state;
    expect(ageMs(dead, B + 500 * H)).toBe(36 * H);
    expect(formatAge(ageMs(dead, B + 500 * H))).toBe('1d 12h');
  });

  it('33. toGraveRecord', () => {
    const p = newPet(B, mulberry32(1));
    const dead = reconcile(p, B + 36 * H).state;
    const g = toGraveRecord(dead, B + 100 * H);
    expect(g.pet).toEqual(dead);
    expect(g.pet).not.toBe(dead);
    expect(g.diedAt).toBe(B + 36 * H);
    expect(g.ageMs).toBe(36 * H);
    expect(g.buriedAt).toBe(B + 100 * H);
  });
});
