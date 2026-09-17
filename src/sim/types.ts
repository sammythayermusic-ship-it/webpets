// Pure simulation types. This file has zero imports and is the contract every other module builds on.

export type Species = 'fish' | 'hamster' | 'frog' | 'chicken';
export type Habitat = 'bowl' | 'tank' | 'cage' | 'terrarium' | 'pond' | 'jar' | 'brooder' | 'coop';
export type Personality = 'sarcastic' | 'anxious' | 'zen' | 'degen';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type HungerLabel = 'full' | 'peckish' | 'hungry' | 'starving';

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
  pantry: number; // $FEED locked in the habitat feeder
  meals: number;
  feedBurned: number;
  alive: boolean;
  diedAt?: number;
  speciesData: Record<string, number>; // wheelKm, cricketsCaught, eggs, etc.
  /**
   * Everything before this timestamp has already been applied (auto-feeds, events).
   * reconcile() only walks forward from here, so pantry deposits made after a hunger
   * crossing are not applied retroactively, and reconcile is idempotent.
   */
  lastReconciledAt: number;
}

/** Phase 0: LocalLedger (a number). Phase 2: ChainLedger. All amounts are whole $FEED. */
export interface Ledger {
  balance(): number;
  /** Destroy n from the wallet (feeding). Throws RangeError if balance < n. */
  burn(n: number): void;
  /** Move n out of the wallet into the pantry. Throws RangeError if balance < n. */
  debit(n: number): void;
  /** Move n back into the wallet from the pantry. */
  credit(n: number): void;
}

export interface SimConstants {
  DECAY_PER_HOUR: number; // 100 / 60 -> full to empty in 60 h
  FEED_COST: number; // 25
  FEED_GAIN: number; // 45
  MAX_HUNGER: number; // 100
  PANTRY_TRIGGER: number; // 30 -> auto-feed when hunger reaches this
  DEATH_AFTER_ZERO_HOURS: number; // 24
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

export type FeedFailure = 'dead' | 'insufficient-balance';
export type FeedResult = { ok: true; state: PetState } | { ok: false; state: PetState; reason: FeedFailure };

export interface GraveRecord {
  pet: PetState;
  diedAt: number;
  ageMs: number;
  buriedAt: number;
}

/** Deterministic RNG in [0, 1). Tests pass a seeded one; the app passes Math.random. */
export type Rng = () => number;
