// Derived view models. Pure functions of AppState (plus a reduced-motion flag passed in by main.ts).
import type { HungerLabel } from '../sim/types';
import { DEFAULT_CONSTANTS, PANTRY_LOW_DAYS, PANTRY_VISUAL_MAX } from '../sim/constants';
import { hungerLabel, pantryDays } from '../sim/hunger';
import { ageMs, formatAge } from '../sim/pet';
import type { SceneView, ScenePhase } from '../render/types';
import type { AppState } from './types';

export interface HudModel {
  name: string;
  id: string;
  /** Rounded 0..100. */
  hungerPct: number;
  label: HungerLabel;
  pantry: number;
  pantryDays: number;
  balance: number;
  alive: boolean;
  /** "3d 4h" */
  age: string;
  /** alive && balance >= FEED_COST */
  canFeed: boolean;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function scenePhase(s: Pick<AppState, 'pet' | 'latches'>): ScenePhase {
  if (s.pet.alive) return 'alive';
  return s.latches.deathAcknowledgedFor === s.pet.id ? 'memorial' : 'dead';
}

export function toSceneView(s: AppState, prefersReducedMotion: boolean): SceneView {
  const { pet } = s;
  const hunger = pet.alive ? s.hunger : 0;
  return {
    species: pet.species,
    habitat: pet.habitat,
    personality: pet.personality,
    lastFedAt: pet.lastFedAt,
    hunger,
    label: hungerLabel(hunger),
    alive: pet.alive,
    phase: scenePhase(s),
    pantryFraction: clamp01(pet.pantry / PANTRY_VISUAL_MAX),
    pantryLow: pet.pantry > 0 && pantryDays(pet.pantry) < PANTRY_LOW_DAYS,
    night: s.night,
    daylight: s.daylight,
    reducedMotion: prefersReducedMotion,
    asleep: s.night && pet.alive,
  };
}

export function toHudModel(s: AppState): HudModel {
  const { pet } = s;
  const hunger = pet.alive ? s.hunger : 0;
  return {
    name: pet.name,
    id: pet.id,
    hungerPct: Math.round(hunger),
    label: hungerLabel(hunger),
    pantry: pet.pantry,
    pantryDays: pantryDays(pet.pantry),
    balance: s.balance,
    alive: pet.alive,
    age: formatAge(ageMs(pet, s.actions.now())),
    canFeed: pet.alive && s.balance >= DEFAULT_CONSTANTS.FEED_COST,
  };
}
