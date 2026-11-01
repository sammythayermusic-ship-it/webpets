import type { GraveRecord, Habitat, PetState, Personality, Rarity, Rng, Species } from './types';
import { DAY_MS, HOUR_MS } from './constants';

export const NAME_POOLS: Readonly<Record<Species, readonly string[]>> = Object.freeze({
  fish: Object.freeze([
    'Bubbles', 'Gill', 'Finn', 'Nemo', 'Coral', 'Splash', 'Marlin', 'Pebble', 'Sushi', 'Guppy',
    'Neptune', 'Wanda', 'Flounder', 'Kelp', 'Ripple', 'Goldie', 'Blub', 'Captain', 'Poseidon', 'Tuna',
  ]),
  hamster: Object.freeze([
    'Biscuit', 'Nibbles', 'Peanut', 'Hazel', 'Cheeks', 'Waffle', 'Mochi', 'Pip', 'Gizmo', 'Truffle',
    'Cinnamon', 'Butterscotch', 'Nugget', 'Fuzz', 'Pudding', 'Turbo', 'Sprocket', 'Muffin', 'Rolo', 'Chip',
  ]),
  frog: Object.freeze([
    'Croak', 'Lily', 'Hopper', 'Kermit', 'Pond', 'Ribbit', 'Toady', 'Moss', 'Jumper', 'Puddle',
    'Sage', 'Bog', 'Fig', 'Newt', 'Peeper', 'Wart', 'Tadpole', 'Reed', 'Clover', 'Dewey',
  ]),
  chicken: Object.freeze([
    'Waffle', 'Nugget', 'Henrietta', 'Cluck', 'Peep', 'Dumpling', 'Omelette', 'Feathers', 'Pecky', 'Rooster',
    'Goldie', 'Pippa', 'Scramble', 'Marigold', 'Biddy', 'Sunny', 'Drumstick', 'Clementine', 'Hazel', 'Dot',
  ]),
});

/** Starter habitat per species (Phase 0 only renders fish/bowl). */
export const DEFAULT_HABITAT: Readonly<Record<Species, Habitat>> = Object.freeze({
  fish: 'bowl',
  hamster: 'cage',
  frog: 'pond',
  chicken: 'brooder',
});

const PERSONALITIES: readonly Personality[] = ['sarcastic', 'anxious', 'zen', 'hyper'];

function pick<T>(pool: readonly T[], rng: Rng, fallback: T): T {
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[i] ?? fallback;
}

function drawRarity(rng: Rng): Rarity {
  const r = rng();
  if (r < 0.7) return 'common';
  if (r < 0.9) return 'rare';
  if (r < 0.98) return 'epic';
  return 'legendary';
}

export interface NewPetOptions {
  species?: Species;
  name?: string;
}

/**
 * Mint a fresh pet at `now`. Draw order from rng: id, rarity, personality, name (only when no name is given).
 * id "#0001".."#9999"; rarity 70/20/8/2; personality uniform; hunger 100; pantry 0; no diedAt key.
 */
export function newPet(now: number, rng: Rng, opts: NewPetOptions = {}): PetState {
  const species: Species = opts.species ?? 'fish';
  const idNum = 1 + Math.min(9998, Math.max(0, Math.floor(rng() * 9999)));
  const rarity = drawRarity(rng);
  const personality = pick(PERSONALITIES, rng, 'zen');
  const name = opts.name ?? pick(NAME_POOLS[species], rng, 'Pet');
  return {
    id: `#${String(idNum).padStart(4, '0')}`,
    name,
    species,
    habitat: DEFAULT_HABITAT[species],
    personality,
    rarity,
    bornAt: now,
    lastFedAt: now,
    hungerAtLastFed: 100,
    pantry: 0,
    meals: 0,
    foodEaten: 0,
    alive: true,
    speciesData: {},
    lastReconciledAt: now,
  };
}

/** (diedAt ?? now) - bornAt: a dead pet's age is frozen. */
export function ageMs(state: PetState, now: number): number {
  return (state.diedAt ?? now) - state.bornAt;
}

/** "3d 4h" (floor), minimum "0d 0h". */
export function formatAge(ms: number): string {
  const total = Math.max(0, Number.isFinite(ms) ? ms : 0);
  const days = Math.floor(total / DAY_MS);
  const hours = Math.floor((total - days * DAY_MS) / HOUR_MS);
  return `${days}d ${hours}h`;
}

export function toGraveRecord(state: PetState, now: number): GraveRecord {
  const diedAt = state.diedAt ?? now;
  return {
    pet: { ...state, speciesData: { ...state.speciesData } },
    diedAt,
    ageMs: diedAt - state.bornAt,
    buriedAt: now,
  };
}
