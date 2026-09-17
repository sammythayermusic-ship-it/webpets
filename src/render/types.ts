// Render contract types. Implementation in ./scene.ts etc. (owner: render builder).

import type { Habitat, HungerLabel, Rng, Species } from '../sim/types';
import type { Scale } from '../sim/constants';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LayerName =
  | 'shadow'
  | 'bg'
  | 'medium'
  | 'decor_back'
  | 'pantry'
  | 'pantry_fill'
  | 'pet'
  | 'food'
  | 'decor_front'
  | 'glass'
  | 'fx'
  | 'night'
  | 'memorial';

export interface ManifestLayer {
  name: LayerName;
  /** Path relative to the assets root (served at `/`). Omitted for procedural layers (pet, food, fx, shadow). */
  file?: string;
  z: number;
  /** Grid-space top-left of the image when it is not a full 160x120 layer. */
  anchor?: [number, number];
  fillDirection?: 'up';
}

export interface ManifestHabitat {
  grid: [number, number];
  layers: ManifestLayer[];
  water: Rect;
  pantryRect: Rect;
  petAnchor: [number, number];
}

export interface ManifestSpriteState {
  file: string;
  frames: number;
  sequence: number[];
  loop: boolean;
  returnTo?: string;
  /** Per-frame integer [dx, dy] offsets in grid px, same length as `frames`. */
  offsets?: Array<[number, number]>;
}

export interface ManifestSprite {
  frame: [number, number];
  states: Record<string, ManifestSpriteState>;
}

export interface Manifest {
  version: 1;
  habitats: Record<string, ManifestHabitat>; // key "fish/bowl"
  sprites: Record<string, ManifestSprite>; // key species
}

export type PetAnim = 'idle' | 'eat' | 'hungry' | 'sleep' | 'dead';

export interface SceneView {
  species: Species;
  habitat: Habitat;
  hunger: number;
  label: HungerLabel;
  alive: boolean;
  /** pantry / PANTRY_VISUAL_MAX clamped to 0..1 */
  pantryFraction: number;
  pantryLow: boolean;
  night: boolean;
  reducedMotion: boolean;
  asleep: boolean;
}

/** Pantry level that fills the feeder sprite completely. */
export const PANTRY_VISUAL_MAX = 500;

export type SceneEvent = 'bite' | 'flakes-gone';

export interface HabitatScene {
  mount(el: HTMLElement, scale: Scale): Promise<void>;
  setScale(scale: Scale): void;
  setView(view: SceneView): void;
  /** Drop flakes; the fish eats them. Visual only, the sim already applied the feed. */
  feed(): void;
  /** Window-local CSS px, null when the pointer left. Drives glass sheen and parallax. */
  setPointer(x: number | null, y: number | null): void;
  on(event: SceneEvent, cb: () => void): () => void;
  /** Grid-space rect of the habitat inside the window in CSS px, for hit regions. */
  habitatRect(): Rect;
  destroy(): void;
}

export interface FishInput {
  hunger: number;
  alive: boolean;
  asleep: boolean;
  flakes: Array<{ x: number; y: number }>;
  water: Rect;
  rng: Rng;
}

export interface FishOutput {
  x: number;
  y: number;
  facing: 1 | -1;
  anim: PetAnim;
  /** Index into input.flakes that was eaten this tick, else null. */
  biteFlakeIndex: number | null;
}

export interface FishBehavior {
  /** One call = one 8 fps tick. */
  step(input: FishInput): FishOutput;
  reset(): void;
}
