// What a species has to provide. Pure declarations: no Pixi, no DOM, no imports from render/ui
// implementations — only the shared contract types.

import type { Habitat, Rect, Species } from '../sim/types';
import type { Voice } from '../brain/types';
import type { Domain, MoveBounds, PetBehavior } from '../render/types';

/** The hamster's Phase 0 speech pools, adapted into its `Voice` until Step G gives it a full library. */
export type LinePool = 'idle' | 'fed' | 'hungry' | 'starving' | 'wake';

/**
 * How a habitat's pets move through it. Declared in `render/types.ts` because the renderer picks
 * different *physics* from it — food that sinks versus food that lands, bubbles versus none, a death
 * fog volume versus none — and re-exported here so a species module reads one import.
 */
export type { Domain };

/**
 * Where the pet's furniture is, in grid px.
 *
 * The fish has none: a bowl is an empty volume and the fish's targets are all computed. A hamster's
 * behaviour is mostly about *going somewhere specific* — the wheel, the hopper, the bedding pile — so
 * those places have to be data rather than constants buried in the state machine, or the same species
 * could never be re-laid-out for its terrarium upgrade.
 */
export type Sites = Readonly<Record<string, Rect>>;

/** The geometry half of a species: where its habitat is and how big its body box is. */
export interface SpeciesLayout {
  readonly habitat: Habitat;
  readonly domain: Domain;
  /** Bounding rect of the habitat's opaque pixels. Drives hit regions and click-through. */
  readonly opaqueRect: Rect;
  readonly petAnchor: readonly [number, number];
  /** The collision box the behaviour clamps, in grid px. */
  readonly body: Readonly<{ w: number; h: number }>;
  readonly sites?: Sites;
}

/**
 * Everything the app needs to run one species.
 *
 * This interface did not exist before the second species did. The fish was reached by two direct
 * imports — `createFishBehavior` in the scene and `FISH_LINES` in speech — and its layout constants
 * had no declared type at all, so "what is a species" was only ever answered by the fish being the
 * only one. Writing it down is most of the work of adding a second.
 */
export interface SpeciesModule {
  readonly species: Species;
  /**
   * Every habitat this species can live in, keyed by habitat.
   *
   * It was a single `layout`, which made "a species" and "a species in its one habitat" the same
   * thing -- and the blueprint declares two habitats for each of the four species. `layout.ts` had
   * already written down the intent: the sites are data precisely so "the same behaviour [can] be
   * re-laid-out for the terrarium upgrade without touching the state machine".
   */
  readonly layouts: Readonly<Partial<Record<Habitat, SpeciesLayout>>>;
  /** Which habitat a newly created pet of this species gets. */
  readonly defaultHabitat: Habitat;
  /** Fresh state machine per mount; never shared between scenes. */
  createBehavior(): PetBehavior;
  /** What it says and when (src/brain): lines per personality per moment, facts with sources. */
  readonly voice: Voice;
}

/** Built from a {@link Domain} by the render layer; the behaviour only ever sees this. */
export type { MoveBounds };
