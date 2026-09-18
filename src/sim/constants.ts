import type { SimConstants } from './types';

/** Single source of truth for the rules. The dev panel may pass an override object into sim functions. */
export const DEFAULT_CONSTANTS: Readonly<SimConstants> = Object.freeze({
  DECAY_PER_HOUR: 100 / 60,
  FEED_COST: 25,
  FEED_GAIN: 45,
  MAX_HUNGER: 100,
  PANTRY_TRIGGER: 30, // inclusive: auto-feed fires when hunger <= 30 (Blueprint says "drops below"; identical instant with continuous decay)
  DEATH_AFTER_ZERO_HOURS: 24,
});

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Hours before death at which the 'dying-soon' event fires. */
export const DYING_SOON_HOURS = 6;

/** Pantry is "almost empty" below this many days of runway. */
export const PANTRY_LOW_DAYS = 2;

/** Notification "pantry almost empty" only fires while hunger is below this. */
export const PANTRY_LOW_HUNGER_MAX = 60;

/** Starting local $FEED balance for a fresh install. */
export const STARTING_BALANCE = 1000;

/** Habitat grid and window layout. Integer scales only. */
export const GRID_W = 320;
export const GRID_H = 240;
export type Scale = 1 | 2 | 3;
/**
 * The ladder, spelled out. Everything that means "the small window" says `SCALE_S`, never `1`, so the
 * ladder can move again without a grep. The literals below are deliberately plain number literals:
 * `src-tauri/src/window.rs`'s `contract_sync` test parses this file as text and only understands
 * literals. `src/sim/constants.test.ts` pins `SCALES`/`DEFAULT_SCALE` to these names so the duplication
 * cannot drift.
 */
export const SCALE_S: Scale = 1;
export const SCALE_M: Scale = 2;
export const SCALE_L: Scale = 3;
export const SCALES: readonly Scale[] = [1, 2, 3];
/** Scale a fresh install boots at, and the pre-boot fallback size in `src-tauri/tauri.conf.json`. */
export const DEFAULT_SCALE: Scale = 2;
/** Transparent padding around the habitat on every side, in CSS px: room for the HUD pill, caption and drop shadow. */
export const WINDOW_PAD = 24;
/**
 * The only window-size formula in the codebase: the habitat grid at an integer scale plus `WINDOW_PAD`
 * on every side, in CSS px — S 368x288, M 688x528, L 1008x768. `src/platform/geometry.ts` re-exports it,
 * `src/render/scene.ts` sizes the Pixi renderer with it, and `src-tauri/src/window.rs` mirrors it in
 * Rust — a Rust unit test parses the constants above out of this file and fails the build if the two
 * ever disagree.
 */
export function windowSizeForScale(scale: Scale): { width: number; height: number } {
  return { width: GRID_W * scale + 2 * WINDOW_PAD, height: GRID_H * scale + 2 * WINDOW_PAD };
}

export const PET_FPS = 8;
/** Pantry level (in $FEED) that fills the feeder sprite completely. */
export const PANTRY_VISUAL_MAX = 500;
/** Window snaps to a screen edge when within this many CSS px. */
export const SNAP_PX = 16;
/** Rust cursor poll interval for click-through hit testing. */
export const POINTER_POLL_MS = 50;
/** macOS status items are 18 pt tall; 36 px on Retina. */
export type TrayChipSize = 18 | 36;
