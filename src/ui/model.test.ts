import { describe, expect, it } from 'vitest';
import type { PetState } from '../sim/types';
import { DAY_MS, HOUR_MS } from '../sim/constants';
import { PURE_NIGHT } from '../app/daynight';
import { captionText, labelFor, pantryDays, phaseOf, toChipView, toHudModel, tooltipText } from './model';

const NOW = 1_700_000_000_000;

function pet(over: Partial<PetState> = {}): PetState {
  return {
    id: '#0421',
    name: 'Gus',
    species: 'fish',
    habitat: 'bowl',
    personality: 'zen',
    rarity: 'common',
    bornAt: NOW - 3 * DAY_MS - 4 * HOUR_MS,
    lastFedAt: NOW,
    hungerAtLastFed: 100,
    pantry: 475,
    meals: 3,
    feedBurned: 75,
    alive: true,
    speciesData: {},
    lastReconciledAt: NOW,
    ...over,
  };
}

describe('labelFor', () => {
  it('matches the contract thresholds', () => {
    expect(labelFor(100)).toBe('full');
    expect(labelFor(60.0001)).toBe('full');
    expect(labelFor(60)).toBe('peckish');
    expect(labelFor(30.5)).toBe('peckish');
    expect(labelFor(30)).toBe('hungry');
    expect(labelFor(0.01)).toBe('hungry');
    expect(labelFor(0)).toBe('starving');
    expect(labelFor(-1)).toBe('starving');
  });
});

describe('pantryDays', () => {
  it('uses (pantry / 25) * (50 / (100/24)) / 24', () => {
    // 475 / 25 = 19 feeds; each feed buys 50 / (100/24) = 12 h; 19 * 12 / 24 = 9.5 days
    expect(pantryDays(475)).toBeCloseTo(9.5, 6);
    expect(pantryDays(0)).toBe(0);
    expect(pantryDays(-10)).toBe(0);
  });
});

describe('toHudModel', () => {
  it('derives pct, label, canFeed and age', () => {
    const m = toHudModel({ pet: pet(), hunger: 87.4, balance: 1000 }, NOW);
    expect(m.hungerPct).toBe(87);
    expect(m.label).toBe('full');
    expect(m.canFeed).toBe(true);
    expect(m.age).toBe('3d 4h');
    expect(m.alive).toBe(true);
  });
  it('disables feeding below 25 and when dead', () => {
    expect(toHudModel({ pet: pet(), hunger: 50, balance: 24 }, NOW).canFeed).toBe(false);
    expect(toHudModel({ pet: pet(), hunger: 50, balance: 25 }, NOW).canFeed).toBe(true);
    const dead = toHudModel({ pet: pet({ alive: false, diedAt: NOW - HOUR_MS }), hunger: 50, balance: 1000 }, NOW);
    expect(dead.canFeed).toBe(false);
    expect(dead.hungerPct).toBe(0);
    expect(dead.label).toBe('starving');
    expect(dead.age).toBe('3d 3h');
  });
});

describe('captionText / tooltipText', () => {
  it('formats the caption with floored days', () => {
    expect(captionText({ pantry: 475, pantryDays: 9.5 })).toBe('PANTRY 475 $FEED · 9 DAYS');
    // Two meals a day at 25 apiece: 50 in the pantry is exactly one day, and the only place the
    // singular is reachable.
    expect(captionText({ pantry: 50, pantryDays: 1 })).toBe('PANTRY 50 $FEED · 1 DAY');
    expect(captionText({ pantry: 0, pantryDays: 0 })).toBe('PANTRY 0 $FEED · 0 DAYS');
  });
  it('formats the tooltip', () => {
    expect(tooltipText({ name: 'Gus', label: 'peckish', hungerPct: 42 })).toBe('Gus · peckish · 42%');
  });
});

describe('phaseOf / toChipView', () => {
  it('goes alive -> dead -> memorial', () => {
    expect(phaseOf(pet(), null)).toBe('alive');
    const dead = pet({ alive: false, diedAt: NOW });
    expect(phaseOf(dead, null)).toBe('dead');
    expect(phaseOf(dead, '#0421')).toBe('memorial');
    expect(phaseOf(dead, '#9999')).toBe('dead');
  });
  it('builds a SceneView for the chip painter', () => {
    const v = toChipView(
      { pet: pet({ pantry: 25 }), hunger: 20, latches: { pantryLowFiredForPantry: null, deathAcknowledgedFor: null }, night: true, daylight: PURE_NIGHT },
      false,
    );
    expect(v.label).toBe('hungry');
    expect(v.pantryFraction).toBeCloseTo(0.05, 6);
    expect(v.pantryLow).toBe(true);
    expect(v.asleep).toBe(true);
    expect(v.phase).toBe('alive');
  });
});
