// Render contract types. Implementation in ./scene.ts etc. (owner: render builder).

import type { Habitat, HungerLabel, Rect, Rng, Species } from '../sim/types';
import type { Scale, TrayChipSize } from '../sim/constants';

export type { Rect };

/** The 11 layer slots of Blueprint §6 plus the two file-backed variants (pantry_fill under pantry, memorial as a bg variant). */
export type LayerName =
  | 'shadow'
  | 'bg'
  | 'memorial'
  | 'medium'
  | 'decor_back'
  | 'pantry'
  | 'pantry_fill'
  | 'pet'
  | 'food'
  | 'decor_front'
  | 'glass'
  | 'fx'
  | 'night';

export interface ManifestLayer {
  name: LayerName;
  /** Path relative to the assets root (served at `/`). Omitted for procedural layers (shadow, pet, food, fx). */
  file?: string;
  /** Sort order within the fixed slot order (ties broken by slot order). */
  z: number;
  blend?: 'normal' | 'multiply';
}

/** Ellipse-ish water body: ellipse (cx, cy, rx, ry) clipped to surfaceY <= y <= floorY. Grid px. */
export interface WaterShape {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  surfaceY: number;
  floorY: number;
}

export interface ManifestHabitat {
  grid: [number, number];
  layers: ManifestLayer[];
  /** Bounding rect of the water. */
  water: Rect;
  waterShape: WaterShape;
  /** Non-transparent pixels of pantry_fill.png lie inside this rect; the fill is cropped from the bottom up. */
  pantryRect: Rect;
  petAnchor: [number, number];
  /** Bounding rect of the habitat's opaque pixels; used for hit regions and hover. */
  opaqueRect: Rect;
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
  /** Size of the drawn body inside the frame (centered), so behavior can keep it inside the water. */
  body: { w: number; h: number };
  states: Record<string, ManifestSpriteState>;
}

export interface Manifest {
  version: 1;
  habitats: Record<string, ManifestHabitat>; // key "fish/bowl"
  sprites: Record<string, ManifestSprite>; // key species
}

export type PetAnim = 'idle' | 'eat' | 'hungry' | 'sleep' | 'dead';

/** alive: normal. dead: belly-up + fog, bubbles stop. memorial: empty bowl with a flag (after the death card is dismissed). */
export type ScenePhase = 'alive' | 'dead' | 'memorial';

export interface SceneView {
  species: Species;
  habitat: Habitat;
  hunger: number;
  label: HungerLabel;
  alive: boolean;
  phase: ScenePhase;
  /** pantry / PANTRY_VISUAL_MAX clamped to 0..1 */
  pantryFraction: number;
  /** pantry > 0 && pantryDays < PANTRY_LOW_DAYS */
  pantryLow: boolean;
  night: boolean;
  reducedMotion: boolean;
  /** night && alive */
  asleep: boolean;
}

export type SceneEvent = 'bite' | 'flakes-gone';

export interface HabitatScene {
  mount(el: HTMLElement, scale: Scale): Promise<void>;
  /** Resizes the canvas to (160s+48) x (120s+48) CSS px and rescales the habitat sprite. */
  setScale(scale: Scale): void;
  /** Re-create the canvas backing store for a new devicePixelRatio (window moved between displays). */
  setResolution(dpr: number): void;
  setView(view: SceneView): void;
  /** Drop flakes; the fish eats them. Visual only, the sim already applied the feed (manual or auto). */
  feed(): void;
  /** Window-local CSS px, null when the pointer left. Drives glass sheen and parallax. */
  setPointer(x: number | null, y: number | null): void;
  on(event: SceneEvent, cb: () => void): () => void;
  /** Rect of the habitat's opaque pixels inside the window, CSS px: (24 + opaqueRect.x*s, ...). */
  habitatHitRect(): Rect;
  fps(): number;
  /**
   * Dev-only snapshot of what the scene is actually drawing, for the diagnostics bridge. Reading it
   * is how "the fish is not on screen" gets diagnosed without a debugger attached to the webview.
   */
  debugState(): {
    petVisible: boolean;
    petAnim: string;
    petPos: { x: number; y: number };
    petFrame: { w: number; h: number };
    layerAlpha: Record<string, number>;
  };
  /** PNG data URL of the whole canvas (habitat + shadow) rendered right now; for tests and dev diagnostics. */
  snapshot(): Promise<string>;
  destroy(): void;
}

/** Water bounds helper built by render from the manifest's waterShape; passed to the behavior each tick. */
export interface WaterBounds {
  rect: Rect;
  surfaceY: number;
  floorY: number;
  inside(x: number, y: number): boolean;
  /** Nearest point whose body box (halfW, halfH) stays inside the water. */
  clamp(x: number, y: number, halfW: number, halfH: number): { x: number; y: number };
}

export interface FishInput {
  hunger: number;
  label: HungerLabel;
  alive: boolean;
  asleep: boolean;
  flakes: Array<{ x: number; y: number }>;
  bounds: WaterBounds;
  body: { w: number; h: number };
  rng: Rng;
}

export interface FishOutput {
  /** Integer grid px of the body center. */
  x: number;
  y: number;
  facing: 1 | -1;
  /** True for exactly one 8 fps step when facing changes; the player draws that frame at half width. */
  turning: boolean;
  anim: PetAnim;
  /** Index into input.flakes that was eaten this tick, else null. */
  biteFlakeIndex: number | null;
}

export interface FishBehavior {
  /** One call = one 8 fps tick. */
  step(input: FishInput): FishOutput;
  reset(): void;
}

export type { TrayChipSize };
