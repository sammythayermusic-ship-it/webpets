// What a species has to provide. Pure declarations: no Pixi, no DOM, no imports from render/ui
// implementations — only the shared contract types.

import type { Habitat, Personality, Rect, Species } from '../sim/types';
import type { MoveBounds, PetBehavior, WaterShape } from '../render/types';

/** The speech pools every species owes, keyed by the moment that triggers them. */
export type LinePool = 'idle' | 'fed' | 'hungry' | 'starving' | 'wake';

/**
 * How a habitat's pets move through it.
 *
 * A discriminated union rather than an optional field, because the two arms carry genuinely different
 * geometry and the renderer has to pick different *physics* for each — food that sinks versus food
 * that lands, bubbles versus no bubbles, a death fog volume versus none. An optional `waterShape`
 * would have let a cage silently inherit all of it.
 */
export type Domain =
  | { kind: 'water'; shape: WaterShape }
  | { kind: 'floor'; rect: Rect; standY: number };

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
  readonly layout: SpeciesLayout;
  /** Fresh state machine per mount; never shared between scenes. */
  createBehavior(): PetBehavior;
  readonly lines: Readonly<Record<Personality, Readonly<Record<LinePool, readonly string[]>>>>;
}

/** Built from a {@link Domain} by the render layer; the behaviour only ever sees this. */
export type { MoveBounds };
