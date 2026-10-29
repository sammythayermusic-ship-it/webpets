// Render contract types. Implementation in ./scene.ts etc. (owner: render builder).

import type { Habitat, HungerLabel, Personality, Rect, Rng, Species } from '../sim/types';
import type { Drives } from '../sim/needs';
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
  /**
   * A second rendering of the same layer under night lighting, crossfaded in by the night amount.
   *
   * Night used to be a blue tint multiplied over day art. That cannot move a highlight or change
   * where the light comes from; a plate rendered under a moonlit rig can. A layer with a night file
   * is NOT tinted — the crossfade is its night — so the two mechanisms never stack.
   */
  night?: string;
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

/**
 * How a habitat's pets move through it, and therefore what its physics are.
 *
 * Lives here rather than in `src/species` because the render layer needs it: food that sinks through a
 * volume and food that falls onto a floor are different behaviour, not different numbers.
 */
export type Domain =
  | { kind: 'water'; shape: WaterShape }
  | { kind: 'floor'; rect: Rect; standY: number };

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
  /**
   * Which live (real-time 3D) layer this habitat is drawn with, if any. Absent means the habitat is
   * plates and sprites only. `fish-bowl` is candidate C's water-and-fish layer, drawn between the
   * back plates and the front glass in the same WebGL context as the plates.
   */
  live?: LiveSpec;
}

/** A habitat's live layer: which one, and the extra plates it needs that no Pixi layer draws. */
export interface LiveSpec {
  kind: 'fish-bowl';
  /**
   * A grey mask, 4x the grid like the plates: 1 where the bg plate shows a thing (gravel, pebbles,
   * plants, stand), 0 where it shows the back wall of the empty glass. The plate's own alpha cannot
   * tell those apart (the glass is opaque to the film), and the water must: a thing is seen through
   * the water, a bare back wall IS water.
   */
  contents?: string;
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
  /**
   * Grid px this state's full cycle carries the pet. Present == the state is LOCOMOTOR, and its
   * frames advance on distance travelled rather than on a clock.
   *
   * This is what stops the feet sliding. A walk is not a thing that happens at a rate, it is a thing
   * that happens per unit of ground: the hamster's speed is 2.2, 1.4 or 0.3 px per tick depending on
   * how hungry it is, so one 12 fps loop played against a wall clock would cover three different
   * distances and the feet would skate through two of them. Declaring the stride here lets the player
   * advance one frame every `stridePx / sequence.length` px at ANY speed, and it lives in the manifest
   * beside the art because it is a property OF the art -- change how far the legs reach and this
   * number changes with it.
   */
  stridePx?: number;
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

export type PetAnim = 'idle' | 'walk' | 'eat' | 'hungry' | 'sleep' | 'dead';

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
  /**
   * Where the behaviour's drives come from, asked once per simulation tick with whether the pet is
   * currently napping (for the nap hysteresis). Null means no needs model: the behaviour falls back
   * to its pre-needs defaults.
   */
  setDrivesSource(src: ((napping: boolean) => Drives) | null): void;
  /** A tap on the glass at window-local CSS px: handed to the behaviour on its next step. */
  tap(cssX: number, cssY: number): void;
  /**
   * Take the `speciesData` counters earned since the last call, and reset them.
   *
   * A drain rather than an event because these tick at 8 Hz in fractions — the hamster banks about a
   * quarter of a metre per tick — and an event per increment would mean a store write and a throttled
   * disk save eight times a second for a number that is read once a session.
   */
  drainSpeciesDelta(): Record<string, number>;
  /** Rect of the habitat's opaque pixels inside the window, CSS px: (24 + opaqueRect.x*s, ...). */
  habitatHitRect(): Rect;
  /** The same rect in LOGICAL grid px, before any scaling. The resize handle needs it to turn cursor
   * travel into a scale: the habitat's inset from the window edge scales along with everything else. */
  habitatOpaqueRect(): Rect;
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
    /** Present only for a habitat with a live layer: its quality tier and the spine's numbers. */
    live?: { tier: 'full' | 'lean'; spine: Record<string, number> };
  };
  /** PNG data URL of the whole canvas (habitat + shadow) rendered right now; for tests and dev diagnostics. */
  snapshot(): Promise<string>;
  destroy(): void;
}

/**
 * The convex region a pet may move within, built by render from the habitat and handed to the
 * behaviour every tick.
 *
 * Nothing in this shape was ever specific to water — a rect, a top, a bottom, a membership test and a
 * nearest-legal-point clamp describe any movement domain. It was called `WaterBounds` because a fish
 * bowl was the only habitat, and that name then propagated into the behaviour interface, the manifest
 * schema and four render modules, which is what made a land animal look like a rewrite rather than a
 * second implementation.
 *
 * Convexity is load-bearing and not incidental: `scene.ts` interpolates the drawn position between
 * simulation ticks and relies on the region eroded by the body box staying convex, so a point on the
 * segment between two legal positions is itself legal. An ellipse and a rectangle both satisfy that.
 */
export interface MoveBounds {
  rect: Rect;
  /** Top of the band. The waterline for a bowl; the standing line for a floor habitat. */
  surfaceY: number;
  /** Bottom of the band. Equal to `surfaceY` where the pet walks on a single line rather than swims. */
  floorY: number;
  inside(x: number, y: number): boolean;
  /** Nearest point whose body box (halfW, halfH) stays inside the region. */
  clamp(x: number, y: number, halfW: number, halfH: number): { x: number; y: number };
}

/**
 * The old name for {@link MoveBounds}, still imported by the fish's own tests.
 *
 * Kept deliberately rather than editing those tests: the whole claim of this refactor is that it
 * changes no behaviour, and a suite that had to be rewritten to keep passing would prove nothing.
 */
export type WaterBounds = MoveBounds;

export interface PetInput {
  hunger: number;
  label: HungerLabel;
  alive: boolean;
  asleep: boolean;
  flakes: Array<{ x: number; y: number }>;
  bounds: MoveBounds;
  body: { w: number; h: number };
  /**
   * How full the habitat's food store is, 0..1.
   *
   * The pet can SEE its own pantry: a hamster wanders over to stuff its cheeks at the hopper only when
   * there is something in it, and standing at an empty hopper miming a mouthful is worse than not
   * doing it at all. The fish ignores this — a clip-on feeder is not somewhere a fish goes.
   */
  pantryFraction: number;
  /**
   * Something the pet is interested in, in grid px, with 0..1 of how much it cares. Null when there is
   * nothing to look at or it is in no state to care. Food always outranks this: a hungry animal does
   * not stop to investigate a cursor.
   */
  attract: { x: number; y: number; strength: number } | null;
  rng: Rng;
  /**
   * What the pet wants to do about its needs (`src/sim/needs.ts`): how much to move, whether to come
   * to the glass, hide, nap, greet, or visit the surface. Optional so a caller with no needs model
   * (the older tests, a bare scene) gets the pre-needs behaviour; the scene always supplies it.
   */
  drives?: Drives;
  /** Shows in how the pet moves, not only in what it says. Defaults to 'zen' when absent. */
  personality?: Personality;
  /** A tap on the glass since the last tick, grid px. One-shot: present on exactly one step. */
  tap?: { x: number; y: number };
}

export interface PetOutput {
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
  /**
   * Per-tick increments to the pet's `speciesData` counters — the hamster's `wheelKm` while the wheel
   * turns, and later the frog's `cricketsCaught` and the chicken's `eggs`.
   *
   * A generic bag rather than a named field, because `PetOutput` is the contract EVERY species returns
   * and a `wheelKm` on it would be three-quarters dead weight. Omitted entirely on a tick that earned
   * nothing, so the common case costs no allocation.
   */
  speciesDelta?: Readonly<Record<string, number>>;
}

/**
 * One species' movement and animation state machine. One `step` call is one 8 fps simulation tick.
 *
 * Deliberately says nothing about water, food kind, or what the habitat contains: everything it needs
 * arrives in {@link PetInput}, and everything it decides leaves in {@link PetOutput}.
 */
export interface PetBehavior {
  /** One call = one 8 fps tick. */
  step(input: PetInput): PetOutput;
  reset(): void;
}

/** Former names, kept so the fish's tests compile unchanged. See {@link WaterBounds}. */
export type FishInput = PetInput;
export type FishOutput = PetOutput;
export type FishBehavior = PetBehavior;

export type { TrayChipSize };
