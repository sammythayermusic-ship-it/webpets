// Shared helpers for the sim tests (also used by src/app tests). Not part of the runtime API.
import type { PetState, Rng } from './types';
import { newPet } from './pet';
import { HOUR_MS } from './constants';

/** mulberry32: small, fast, seeded PRNG in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Test epoch, an integer ms timestamp. */
export const B = 1_700_000_000_000;
export const H = HOUR_MS;

/** Fresh pet born at `at` with pantry 0, from a fixed seed so names/ids are stable. */
export function fresh(at: number = B, seed = 1): PetState {
  return newPet(at, mulberry32(seed));
}
