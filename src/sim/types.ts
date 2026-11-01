// Pure simulation types. This file has zero imports and is the contract every other module builds on.

export type Species = 'fish' | 'hamster' | 'frog' | 'chicken';
export type Habitat = 'bowl' | 'tank' | 'cage' | 'terrarium' | 'pond' | 'jar' | 'brooder' | 'coop';
export type Personality = 'sarcastic' | 'anxious' | 'zen' | 'hyper';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type HungerLabel = 'full' | 'peckish' | 'hungry' | 'starving';

/** Axis-aligned rectangle. Lives here (zero-import module) so every layer can share it. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PetState {
  id: string; // "#0421"
  name: string;
  species: Species;
  habitat: Habitat;
  personality: Personality;
  rarity: Rarity;
  bornAt: number; // ms epoch
  lastFedAt: number; // ms epoch
  hungerAtLastFed: number; // 0..100, hunger value right after the last feed
  pantry: number; // food in the habitat's holiday feeder; it auto-feeds the pet one MEAL_SIZE at a time
  meals: number;
  foodEaten: number; // MEAL_SIZE per meal, manual or from the feeder
  alive: boolean;
  diedAt?: number;
  speciesData: Record<string, number>; // wheelKm, cricketsCaught, eggs, etc.
  /**
   * Everything before this timestamp has already been applied (auto-feeds, events).
   * reconcile() only walks forward from here, so a feeder filled after a hunger
   * crossing does not feed retroactively, and reconcile is idempotent.
   */
  lastReconciledAt: number;
}

export interface SimConstants {
  DECAY_PER_HOUR: number; // 100 / 24 -> full to empty in a day
  MEAL_SIZE: number; // 25: the food one meal takes from the feeder (and adds to foodEaten)
  FEED_GAIN: number; // 50: hunger points one meal restores
  MAX_HUNGER: number; // 100
  PANTRY_TRIGGER: number; // 30 -> auto-feed when hunger reaches this
  DEATH_AFTER_ZERO_HOURS: number; // 12
}

/** Events reconcile() reports, in chronological order, each stamped with the exact time it happened. */
export type SimEvent =
  | { type: 'auto-fed'; at: number; pantryAfter: number; hungerAfter: number }
  | { type: 'hungry'; at: number } // hunger crossed down through PANTRY_TRIGGER (30) with no pantry feed
  | { type: 'starving'; at: number } // hunger reached 0
  | { type: 'dying-soon'; at: number; diesAt: number } // 6 h before death
  | { type: 'died'; at: number };

export interface ReconcileResult {
  state: PetState;
  events: SimEvent[];
}

/** Feeding is free; the only thing that can stop a meal is a dead pet. */
export type FeedFailure = 'dead';
/** Every mutator reconciles first; `events` carries the catch-up events (and any auto-feed at `now`) in order. */
export type FeedResult =
  | { ok: true; state: PetState; events: SimEvent[] }
  | { ok: false; state: PetState; events: SimEvent[]; reason: FeedFailure };

export interface GraveRecord {
  pet: PetState;
  diedAt: number;
  ageMs: number;
  buriedAt: number;
}

/** Deterministic RNG in [0, 1). Tests pass a seeded one; the app passes Math.random. */
export type Rng = () => number;
