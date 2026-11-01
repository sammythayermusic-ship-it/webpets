// DOM-free derivations from AppState for the HUD, tray chip and speech triggers.
// Deliberately local (not imported from app/view.ts) so the ui module compiles and tests independently.
// The thresholds and pantry-days formula are the contract's (docs/ARCHITECTURE.md "Simulation API").

import type { AppState } from '../app/types';
import type { HungerLabel, PetState } from '../sim/types';
import type { SceneView, ScenePhase } from '../render/types';
import { DEFAULT_CONSTANTS, FULL_ABOVE, PANTRY_CAPACITY, PANTRY_LOW_DAYS } from '../sim/constants';
import { formatAge } from './format';

/**
 * The ui-side copy of `hungerLabel` (src/sim/hunger.ts), kept local so this module never imports the
 * sim. Both read the same named boundaries; `labelSync.test.ts` asserts they never disagree.
 */
export function labelFor(h: number): HungerLabel {
  if (!(h > 0)) return 'starving';
  if (h <= DEFAULT_CONSTANTS.PANTRY_TRIGGER) return 'hungry';
  if (h <= FULL_ABOVE) return 'peckish';
  return 'full';
}

/** (pantry / MEAL_SIZE) * (FEED_GAIN / DECAY_PER_HOUR) / 24 */
export function pantryDays(pantry: number): number {
  const c = DEFAULT_CONSTANTS;
  const safe = Number.isFinite(pantry) && pantry > 0 ? pantry : 0;
  return (safe / c.MEAL_SIZE) * (c.FEED_GAIN / c.DECAY_PER_HOUR) / 24;
}

/** Whole meals the feeder can still serve. */
export function pantryMeals(pantry: number): number {
  const safe = Number.isFinite(pantry) && pantry > 0 ? pantry : 0;
  return Math.floor(safe / DEFAULT_CONSTANTS.MEAL_SIZE);
}

export interface HudModel {
  name: string;
  id: string;
  hungerPct: number; // 0..100 integer
  label: HungerLabel;
  pantry: number;
  pantryDays: number;
  alive: boolean;
  age: string;
  /** Food is free: any living pet can be fed. */
  canFeed: boolean;
}

export function toHudModel(s: Pick<AppState, 'pet' | 'hunger'>, now: number): HudModel {
  const pet = s.pet;
  const hunger = pet.alive ? s.hunger : 0;
  const pct = Math.max(0, Math.min(100, Math.round(hunger)));
  return {
    name: pet.name,
    id: pet.id,
    hungerPct: pct,
    label: labelFor(hunger),
    pantry: pet.pantry,
    pantryDays: pantryDays(pet.pantry),
    alive: pet.alive,
    age: formatAge((pet.diedAt ?? now) - pet.bornAt),
    canFeed: pet.alive,
  };
}

/**
 * The holiday feeder under the habitat: `FEEDER · 3 DAYS` with days = floor(pantryDays); under a day it
 * counts meals (`FEEDER · 1 MEAL`), and with not even one meal in it, `FEEDER EMPTY`.
 */
export function captionText(m: Pick<HudModel, 'pantry' | 'pantryDays'>): string {
  const meals = pantryMeals(m.pantry);
  if (meals === 0) return 'FEEDER EMPTY';
  const days = Math.floor(m.pantryDays);
  if (days === 0) return `FEEDER · ${meals} ${meals === 1 ? 'MEAL' : 'MEALS'}`;
  return `FEEDER · ${days} ${days === 1 ? 'DAY' : 'DAYS'}`;
}

/** The caption warns (`.low`) when the feeder holds food but under PANTRY_LOW_DAYS of it. */
export function captionLow(m: Pick<HudModel, 'pantry' | 'pantryDays'>): boolean {
  return m.pantry > 0 && m.pantryDays < PANTRY_LOW_DAYS;
}

/** Tray tooltip: "<name> · <label> · <pct>%". */
export function tooltipText(m: Pick<HudModel, 'name' | 'label' | 'hungerPct'>): string {
  return `${m.name} · ${m.label} · ${m.hungerPct}%`;
}

export function phaseOf(pet: PetState, deathAcknowledgedFor: string | null): ScenePhase {
  if (pet.alive) return 'alive';
  return deathAcknowledgedFor === pet.id ? 'memorial' : 'dead';
}

/** Minimal SceneView for paintTrayChip; mirrors app/view.ts's toSceneView without importing it. */
export function toChipView(
  s: Pick<AppState, 'pet' | 'hunger' | 'latches' | 'night' | 'daylight'>,
  reducedMotion: boolean,
): SceneView {
  const pet = s.pet;
  const hunger = pet.alive ? s.hunger : 0;
  const days = pantryDays(pet.pantry);
  return {
    species: pet.species,
    habitat: pet.habitat,
    personality: pet.personality,
    lastFedAt: pet.lastFedAt,
    hunger,
    label: labelFor(hunger),
    alive: pet.alive,
    phase: phaseOf(pet, s.latches.deathAcknowledgedFor),
    pantryFraction: Math.max(0, Math.min(1, pet.pantry / PANTRY_CAPACITY)),
    pantryLow: pet.pantry > 0 && days < PANTRY_LOW_DAYS,
    night: s.night,
    daylight: s.daylight,
    reducedMotion,
    asleep: s.night && pet.alive,
  };
}
