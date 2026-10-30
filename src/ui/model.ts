// DOM-free derivations from AppState for the HUD, tray chip and speech triggers.
// Deliberately local (not imported from app/view.ts) so the ui module compiles and tests independently.
// The thresholds and pantry-days formula are the contract's (docs/ARCHITECTURE.md "Simulation API").

import type { AppState } from '../app/types';
import type { HungerLabel, PetState } from '../sim/types';
import type { SceneView, ScenePhase } from '../render/types';
import { DEFAULT_CONSTANTS, FULL_ABOVE, PANTRY_LOW_DAYS, PANTRY_VISUAL_MAX } from '../sim/constants';
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

/** (pantry / FEED_COST) * (FEED_GAIN / DECAY_PER_HOUR) / 24 */
export function pantryDays(pantry: number): number {
  const c = DEFAULT_CONSTANTS;
  const safe = Number.isFinite(pantry) && pantry > 0 ? pantry : 0;
  return (safe / c.FEED_COST) * (c.FEED_GAIN / c.DECAY_PER_HOUR) / 24;
}

export interface HudModel {
  name: string;
  id: string;
  hungerPct: number; // 0..100 integer
  label: HungerLabel;
  pantry: number;
  pantryDays: number;
  balance: number;
  alive: boolean;
  age: string;
  canFeed: boolean;
}

export function toHudModel(s: Pick<AppState, 'pet' | 'hunger' | 'balance'>, now: number): HudModel {
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
    balance: s.balance,
    alive: pet.alive,
    age: formatAge((pet.diedAt ?? now) - pet.bornAt),
    canFeed: pet.alive && s.balance >= DEFAULT_CONSTANTS.FEED_COST,
  };
}

/** `PANTRY 475 $FEED · 21 DAYS` with days = floor(pantryDays). */
export function captionText(m: Pick<HudModel, 'pantry' | 'pantryDays'>): string {
  const days = Math.floor(m.pantryDays);
  return `PANTRY ${m.pantry} $FEED · ${days} ${days === 1 ? 'DAY' : 'DAYS'}`;
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
    pantryFraction: Math.max(0, Math.min(1, pet.pantry / PANTRY_VISUAL_MAX)),
    pantryLow: pet.pantry > 0 && days < PANTRY_LOW_DAYS,
    night: s.night,
    daylight: s.daylight,
    reducedMotion,
    asleep: s.night && pet.alive,
  };
}
