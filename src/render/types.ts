// Render contract types. Implementation in ./scene.ts etc. (owner: render builder).

import type { Habitat, HungerLabel, Personality, Rect, Rng, Species } from '../sim/types';
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
  /**
   * The LOGICAL habitat size. It defines behaviour, water bounds and hit regions, and it does NOT
   * change when the art's resolution does: a 1280x960 layer set and a 320x240 one both describe this
   * same 320x240 grid, and the renderer scales each layer by grid/texture to cover it. The factor is
   * derived from the texture rather than declared here precisely so the two can never drift.
   */
  grid: [number, number];
  layers: ManifestLayer[];
  /** Bounding rect of the water. */
  water: Rect;
  waterShape: WaterShape;
  /**
   * Where an in-scene food gauge lives: non-transparent pixels of pantry_fill.png lie inside this rect
   * and the fill is cropped from the bottom up. Optional, because a habitat need not show one — the
   * bowl's clip-on feeder was removed and its pantry level now reads only in the hover caption.
   */
  pantryRect?: Rect;
  petAnchor: [number, number];
  /** Bounding rect of the habitat's opaque pixels; used for hit regions and hover. */
  opaqueRect: Rect;
}

/**
 * Where a state's frames live.
 *
 * `strip` is the Phase 0 pixel-art layout: one PNG, frames left to right in a single row.
 * `sequence` is one PNG per frame, which is what a 3D render produces — and which is the only one of
 * the two that can be mipmapped, because neighbouring frames in a strip bleed into each other at low
 * mip levels. Mipmaps are not optional here: at the smallest window the art is minified several times
 * over, and bilinear-only minification of a large texture crawls as the sprite moves.
 */
export type FrameSource =
  | { readonly kind: 'strip'; readonly file: string }
  | { readonly kind: 'sequence'; readonly files: readonly string[] };

export interface ManifestSpriteState {
  source: FrameSource;
  /**
   * Where this state's art sits in its frame, relative to the state the simulation was tuned against,
   * in LOGICAL grid px. Subtracted when drawing so every state puts the pet's body in the same place.
   *
   * Without it the art and the simulation disagree permanently, not just during a transition. The
   * states were rendered from separate poses and their bodies sit at different heights in the frame:
   * measured on the shipped fish, `hungry` sits 4.9 px low and `dead` 9.6 px high. Since every
   * simulation constant was tuned against the idle art, that is 4.25 px of a starving fish's belly
   * drawn inside the gravel and 9.25 px of a dead fish's tail drawn above the waterline — the exact
   * failure the water clamp exists to prevent, arriving through the art instead of the geometry.
   *
   * Fractional. Whole numbers were a pixel-art constraint.
   */
  anchor?: [number, number];
  frames: number;
  sequence: number[];
  loop: boolean;
  returnTo?: string;
  /** Per-frame integer [dx, dy] offsets in grid px, same length as `frames`. */
  offsets?: Array<[number, number]>;
}

export interface ManifestSprite {
  /**
   * The frame's LOGICAL footprint in grid px. The texture may be any integer multiple of this, so
   * raising the art's resolution never changes how big the pet is drawn — that is what `frame` means.
   */
  frame: [number, number];
  /**
   * Frames per second the art was authored at, independent of the simulation's tick rate. Defaults to
   * PET_FPS so the Phase 0 strips, whose `sequence` tables were hand-written as 8 Hz step tables, keep
   * their exact timing while newer art declares its own.
   */
  fps?: number;
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
  /** Drives the mood engine's temperament. Same four personalities the speech lines use. */
  personality: Personality;
  /**
   * ms epoch of the last meal. An absolute time rather than an elapsed one deliberately: the scene
   * recomputes the post-meal glow every tick, and a "ms since" field would have to be republished
   * continuously to stay true.
   */
  lastFedAt: number;
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
    /** Where the simulation says the pet is. */
    petPos: { x: number; y: number };
    /** Where it is actually drawn: interpolated across the tick and offset by the state's registration. */
    drawnPos: { x: number; y: number };
    petFrame: { w: number; h: number };
    /**
     * How many times the scene advanced since mount, and the last frame time it was given.
     *
     * Sampled across an interval this is the only honest measure of whether anything is running:
     * Pixi's own `fps` is seeded to 60 and corrected only by a tick, so on the exact failure worth
     * catching -- a throttled window whose ticker never fires -- it cheerfully reports 60.
     */
    advances: number;
    lastDtMs: number;
    /** Which clock is driving when the ticker is throttled: an unclamped worker, or a clamped timer. */
    pacer: 'worker' | 'timer';
    /** Rolling mean cost of one rendered frame, ms. A high value means slow, not throttled. */
    renderMs: number;
    /** Behaviour steps run since mount, and steps skipped for want of a view: 0/0 means a frozen scene. */
    steps: number;
    stepSkips: number;
    hasView: boolean;
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
  /**
   * Something the pet is interested in, in grid px, with 0..1 of how much it cares. Null when there is
   * nothing to look at or it is in no state to care. Food always outranks this: a hungry animal does
   * not stop to investigate a cursor.
   */
  attract: { x: number; y: number; strength: number } | null;
  rng: Rng;
}

export interface FishOutput {
  /** Integer grid px of the body center. */
  x: number;
  y: number;
  facing: 1 | -1;
  /**
   * True for exactly one tick when facing changes, and the tick the behaviour holds position for.
   * The sprite player ignores it and tweens the flip off the facing change itself, which cannot be
   * missed or double-triggered by the several rendered frames that share one tick.
   */
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
