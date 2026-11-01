import { describe, expect, it } from 'vitest';
import type { PetState } from '../sim/types';
import { DAY_MS, HOUR_MS } from '../sim/constants';
import { PURE_NIGHT } from '../app/daynight';
import { captionLow, captionText, labelFor, pantryDays, pantryMeals, phaseOf, toChipView, toHudModel, tooltipText } from './model';

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
    foodEaten: 75,
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
    expect(pantryDays(150)).toBeCloseTo(3, 9);
  });
  it('counts whole meals', () => {
    expect(pantryMeals(150)).toBe(6);
    expect(pantryMeals(24)).toBe(0);
    expect(pantryMeals(Number.NaN)).toBe(0);
  });
});

describe('toHudModel', () => {
  it('derives pct, label, canFeed and age', () => {
    const m = toHudModel({ pet: pet(), hunger: 87.4 }, NOW);
    expect(m.hungerPct).toBe(87);
    expect(m.label).toBe('full');
    expect(m.canFeed).toBe(true);
    expect(m.age).toBe('3d 4h');
    expect(m.alive).toBe(true);
  });
  it('feeding is free: only a dead pet cannot be fed', () => {
    expect(toHudModel({ pet: pet({ pantry: 0 }), hunger: 50 }, NOW).canFeed).toBe(true);
    const dead = toHudModel({ pet: pet({ alive: false, diedAt: NOW - HOUR_MS }), hunger: 50 }, NOW);
    expect(dead.canFeed).toBe(false);
    expect(dead.hungerPct).toBe(0);
    expect(dead.label).toBe('starving');
    expect(dead.age).toBe('3d 3h');
  });
});

describe('captionText / tooltipText', () => {
  it('formats the feeder caption: floored days, then meals, then empty', () => {
    // A full feeder is three days; two meals a day at 25 apiece.
    expect(captionText({ pantry: 150, pantryDays: 3 })).toBe('FEEDER · 3 DAYS');
    expect(captionText({ pantry: 125, pantryDays: 2.5 })).toBe('FEEDER · 2 DAYS');
    expect(captionText({ pantry: 50, pantryDays: 1 })).toBe('FEEDER · 1 DAY');
    // Under a day the days would floor to zero while there is still a meal in it.
    expect(captionText({ pantry: 25, pantryDays: 0.5 })).toBe('FEEDER · 1 MEAL');
    // Less than a meal cannot feed anyone.
    expect(captionText({ pantry: 10, pantryDays: 0.2 })).toBe('FEEDER EMPTY');
    expect(captionText({ pantry: 0, pantryDays: 0 })).toBe('FEEDER EMPTY');
    // Overfilled from the dev panel.
    expect(captionText({ pantry: 475, pantryDays: 9.5 })).toBe('FEEDER · 9 DAYS');
  });
  it('flags a low feeder under a day of food, but not an empty one', () => {
    expect(captionLow({ pantry: 25, pantryDays: 0.5 })).toBe(true);
    expect(captionLow({ pantry: 50, pantryDays: 1 })).toBe(false);
    expect(captionLow({ pantry: 0, pantryDays: 0 })).toBe(false);
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
    expect(v.pantryFraction).toBeCloseTo(25 / 150, 6);
    expect(v.pantryLow).toBe(true);
    expect(v.asleep).toBe(true);
    expect(v.phase).toBe('alive');
  });
});
