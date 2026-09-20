// The species registry.
//
// Before this existed the app reached the fish by two direct imports -- `createFishBehavior` in
// `render/scene.ts` and `FISH_LINES` in `ui/speech.ts` -- which is why the fish was not merely the
// default species but the only one that could exist. Everything species-shaped now resolves through
// here, and the map being `Partial` is deliberate: `Species` has had four members since the first
// commit while only one was ever implemented, so a type that claimed all four were present would be
// lying. Callers handle the miss.

import type { Habitat, Species } from '../sim/types';
import type { SpeciesLayout, SpeciesModule } from './types';
import { FISH_MODULE } from './fish/module';
import { HAMSTER_MODULE } from './hamster/module';

const REGISTRY: Partial<Record<Species, SpeciesModule>> = {
  fish: FISH_MODULE,
  hamster: HAMSTER_MODULE,
};

/** The module for a species, or null when it is declared in the union but not yet built. */
export function speciesModule(species: Species): SpeciesModule | null {
  return REGISTRY[species] ?? null;
}

/** The module for a species, throwing rather than rendering an empty habitat. */
export function requireSpecies(species: Species): SpeciesModule {
  const m = REGISTRY[species];
  if (!m) throw new Error(`species "${species}" is declared but not implemented`);
  return m;
}

/** The layout for one species in one habitat, or null if that pairing is not built. */
export function speciesLayout(species: Species, habitat: Habitat): SpeciesLayout | null {
  return REGISTRY[species]?.layouts[habitat] ?? null;
}

/** Which species are actually playable. The dev panel's dropdown reads this rather than a second list. */
export function implementedSpecies(): Species[] {
  return Object.keys(REGISTRY) as Species[];
}

export type { SpeciesModule, SpeciesLayout, Domain, Sites, LinePool } from './types';
