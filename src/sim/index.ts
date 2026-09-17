// Public surface of the pure simulation. Zero imports from outside src/sim.
export type {
  FeedFailure,
  FeedResult,
  GraveRecord,
  Habitat,
  HungerLabel,
  Ledger,
  PantryResult,
  Personality,
  PetState,
  Rarity,
  Rect,
  ReconcileResult,
  Rng,
  SimConstants,
  SimEvent,
  Species,
} from './types';
export {
  DAY_MS,
  DEFAULT_CONSTANTS,
  DYING_SOON_HOURS,
  GRID_H,
  GRID_W,
  HOUR_MS,
  PANTRY_LOW_DAYS,
  PANTRY_LOW_HUNGER_MAX,
  PANTRY_VISUAL_MAX,
  PET_FPS,
  POINTER_POLL_MS,
  SCALES,
  SNAP_PX,
  STARTING_BALANCE,
  WINDOW_PAD,
} from './constants';
export type { Scale, TrayChipSize } from './constants';
export { hungerAt, hungerLabel, pantryDays, projectedDeathAt, zeroAt } from './hunger';
export { reconcile } from './reconcile';
export { depositPantry, feed, withdrawPantry } from './feed';
export { DEFAULT_HABITAT, NAME_POOLS, ageMs, formatAge, newPet, toGraveRecord } from './pet';
export type { NewPetOptions } from './pet';
export { LocalLedger } from './ledger';
