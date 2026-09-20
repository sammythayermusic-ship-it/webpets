import type { SimConstants } from './types';

/** Single source of truth for the rules. The dev panel may pass an override object into sim functions. */
export const DEFAULT_CONSTANTS: Readonly<SimConstants> = Object.freeze({
  // The pet is fed TWICE A DAY. Everything below is that one sentence, expressed in numbers.
  //
  // A meal is worth exactly half the bar, and the bar empties in exactly a day, so a meal buys exactly
  // twelve hours: feed at 100, read 50 at lunch, feed again. The auto-feed cycle lands on the same
  // twelve hours for free, because 30 -> 80 is also fifty points. Keeping the meal an exact half is
  // what makes the rhythm legible on the HUD ring rather than something you have to be told.
  //
  // It used to be a 45-point meal against a 60-hour bar -- a 27-hour cycle, so a bit less than once a
  // day, and a fresh pet survived three and a half days of silence. See docs/DECISIONS.md.
  DECAY_PER_HOUR: 100 / 24,
  FEED_COST: 25,
  FEED_GAIN: 50,
  MAX_HUNGER: 100,
  PANTRY_TRIGGER: 30, // inclusive: auto-feed fires when hunger <= 30 (Blueprint says "drops below"; identical instant with continuous decay)
  // Starving by morning if you skip the evening meal, gone by that evening if you skip the day.
  DEATH_AFTER_ZERO_HOURS: 12,
});

/**
 * Hunger at or below which the pet reads 'peckish' rather than 'full'.
 *
 * Named because it was a bare `60` in BOTH `hungerLabel` (src/sim/hunger.ts) and `labelFor`
 * (src/ui/model.ts). That duplication is deliberate -- src/ui must not import the sim -- but a literal
 * repeated across a module boundary is not duplication, it is a drift waiting to happen, and retuning
 * the clock is exactly the moment it would have drifted. `PANTRY_TRIGGER` is the lower boundary and was
 * already shared; this is its missing other half. `labelSync.test.ts` pins the two implementations
 * together across the whole range.
 */
export const FULL_ABOVE = 60;

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

/** Habitat grid and window layout. */
export const GRID_W = 320;
export const GRID_H = 240;

/**
 * The window scale, as an integer count of EIGHTHS of the logical grid. `16` is 2x, `8` is 1x.
 *
 * An integer count rather than a fraction, because the window size has to come out identical in two
 * languages that never see each other's arithmetic. `GRID_W` and `GRID_H` are both divisible by 8, so
 * `windowSizeForScale` is `40n + 48` by `30n + 48` — exact whole pixels for every value, with no
 * rounding rule to keep in step and no reliance on two JSON parsers agreeing about a float. If Rust
 * and TypeScript ever disagreed by a single pixel the click-through region would stop matching the
 * art, and the symptom is the window silently eating clicks meant for whatever is behind it.
 *
 * It was three named rungs (1, 2, 3) for as long as the renderer drew on a pixel grid and only whole
 * multiples were legal. That constraint went when the art did.
 */
export type Scale = number;
export const SCALE_STEPS_PER_UNIT = 8;
/** 0.5x. Half the grid; below this the fish stops being readable at all. */
export const MIN_SCALE = 4;
/** 4x, which is exactly 1:1 with the art's own resolution and so the natural ceiling. */
export const MAX_SCALE = 32;
/**
 * The named rungs the tray menu offers.
 *
 * Small is 0.75x rather than 1x so that it is the size the app starts at: a fresh install landing
 * between two named rungs would show no tick in the Size menu.
 */
export const SCALE_S: Scale = 6;
export const SCALE_M: Scale = 16;
export const SCALE_L: Scale = 24;
/** Scale a fresh install boots at, and the pre-boot fallback size in `src-tauri/tauri.conf.json`. */
export const DEFAULT_SCALE: Scale = 6;
/** Transparent padding around the habitat on every side, in CSS px: room for the HUD pill, caption and drop shadow. */
export const WINDOW_PAD = 24;

/** Rounds and clamps an arbitrary number into the legal scale range. */
export function clampScale(raw: number): Scale {
  const n = Math.round(raw);
  return n < MIN_SCALE ? MIN_SCALE : n > MAX_SCALE ? MAX_SCALE : n;
}

/** How much bigger than the logical grid the habitat is drawn, as a plain multiplier. */
export function scaleFactor(scale: Scale): number {
  return scale / SCALE_STEPS_PER_UNIT;
}

/**
 * The only window-size formula in the codebase: the habitat grid at `scale` eighths plus `WINDOW_PAD`
 * on every side, in CSS px. `src/platform/geometry.ts` re-exports it, `src/render/scene.ts` sizes the
 * Pixi renderer with it, and `src-tauri/src/window.rs` mirrors it in Rust — a Rust unit test parses the
 * constants above out of this file and fails the build if the two ever disagree.
 */
export function windowSizeForScale(scale: Scale): { width: number; height: number } {
  return {
    width: (GRID_W * scale) / SCALE_STEPS_PER_UNIT + 2 * WINDOW_PAD,
    height: (GRID_H * scale) / SCALE_STEPS_PER_UNIT + 2 * WINDOW_PAD,
  };
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
