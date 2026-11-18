// Step 3: the habitat's own life, so the scene carries itself while the pet sleeps.
//
// One module per habitat, built from the manifest's `ambient` spec. It owns three containers the scene
// puts in its slots: `back` under the pet (the wheel, the doorway's shade), `front` over the pet and
// under the near decor (dust, the bottle's bubbles and drips, bedding thrown by a dig, the snail on
// the glass) and `top` over the glass (the moth, which is outside it).
//
// The motion is pure functions of time and state, exported for the tests: the wheel's spin and coast,
// the snail's place on the glass (a function of the WALL CLOCK, an inch an hour, so it is somewhere
// else each time you look), the moth's flight round the light, how bright a mote is where it floats.
// Everything that happens emits a named event the audio module can play (`assets/audio/<species>/
// <event>.ogg`, all optional; none exist yet).

import { Container, Sprite, type Texture } from 'pixi.js';
import type { Daylight } from '../sim/daylight';
import type { AmbientSpec, LightTints, PetAct, Rect } from './types';
import { FX_SS, paintTexture, smoothstep } from './fx';

/** Every ambient sound the habitat can make. The audio module plays `<name>.ogg` if it exists. */
export type AmbientEvent =
  | 'wheel_spin'
  | 'wheel_coast'
  | 'bottle_drink'
  | 'bottle_drip'
  | 'bedding_dig'
  | 'moth_flutter'
  | 'snail_crawl'
  | 'water_murky'
  | 'water_clear'
  | 'hood_on'
  | 'hood_off'
  // Step 5
  | 'frog_croak'
  | 'tongue_snap'
  | 'fireflies_out'
  | 'hen_scratch'
  | 'dust_bath'
  | 'egg_laid';

export const AMBIENT_EVENTS: readonly AmbientEvent[] = [
  'wheel_spin',
  'wheel_coast',
  'bottle_drink',
  'bottle_drip',
  'bedding_dig',
  'moth_flutter',
  'snail_crawl',
  'water_murky',
  'water_clear',
  'hood_on',
  'hood_off',
  'frog_croak',
  'tongue_snap',
  'fireflies_out',
  'hen_scratch',
  'dust_bath',
  'egg_laid',
];

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- the wheel -----------------------------------------------------------------------------------

export interface WheelState {
  /** Radians turned, ever. */
  angle: number;
  /** Radians per second. */
  omega: number;
}

/**
 * Full running pace. A real hamster turns a wheel about once a second; this is a little under, and it
 * is also the most the frames can show: at 60 fps a rung must move less than half its spacing per
 * frame or the eye sees it run backwards (spacing 0.286 rad, so the limit is 8.6 rad/s).
 */
export const WHEEL_RUN_OMEGA = 5.2;
/** Spin-up time constant, seconds: a hamster gets a wheel going in about a second. */
const WHEEL_SPINUP_S = 0.35;
/** Coasting: an exponential slow-down plus a little dry friction, so it actually stops. */
const WHEEL_COAST_S = 1.6;
const WHEEL_FRICTION = 0.22;

/** One step of the wheel: driven toward `drive` x full pace while running, coasting down after. */
export function wheelStep(s: WheelState, drive: number, dtS: number): WheelState {
  const dt = Math.max(0, dtS);
  let omega: number;
  if (drive > 0) {
    const target = WHEEL_RUN_OMEGA * Math.min(1.3, drive);
    omega = s.omega + (target - s.omega) * (1 - Math.exp(-dt / WHEEL_SPINUP_S));
  } else {
    omega = s.omega * Math.exp(-dt / WHEEL_COAST_S);
    const mag = Math.max(0, Math.abs(omega) - WHEEL_FRICTION * dt);
    omega = Math.sign(omega) * mag;
  }
  // Keep the angle small (it is only ever used modulo a loop) without changing its phase.
  const angle = (s.angle + omega * dt) % (TAU * 1000);
  return { angle, omega };
}

/** Which frame of a loop of `frames` covering `loopRad` shows the wheel at `angle`. */
export function wheelFrame(angle: number, loopRad: number, frames: number): number {
  if (frames <= 1 || loopRad <= 0) return 0;
  const t = ((angle % loopRad) + loopRad) % loopRad;
  return Math.min(frames - 1, Math.floor((t / loopRad) * frames));
}

// ---- the snail -----------------------------------------------------------------------------------

/** One lap of its loop on the glass, in hours of CRAWLING (it rests too; see snailPose). */
export const SNAIL_LAP_HOURS = 12;
/** It crawls for 18 minutes, then rests for 12, every half hour. */
const SNAIL_CYCLE_H = 0.5;
const SNAIL_CRAWL_H = 0.3;

export interface SnailPose {
  x: number;
  y: number;
  /** Which way it faces: 1 right, -1 left. */
  dir: 1 | -1;
  /** Radians, the slope of the glass it is on, kept gentle. */
  tilt: number;
  crawling: boolean;
}

/** Hours spent crawling by wall-clock time `nowMs`. */
export function snailCrawlHours(nowMs: number): number {
  const h = nowMs / 3_600_000;
  const cycles = Math.floor(h / SNAIL_CYCLE_H);
  const into = h - cycles * SNAIL_CYCLE_H;
  return cycles * SNAIL_CRAWL_H + Math.min(into, SNAIL_CRAWL_H);
}

/**
 * Where the snail is at wall-clock time `nowMs`: a loop on the glass, an inch an hour (the loop is
 * about 260 grid px and a grid px is 1.3 mm, so a lap of 12 crawling hours is about an inch an hour).
 * A function of the clock and nothing else, so it is where it should be after a night away.
 */
export function snailPose(nowMs: number, p: { cx: number; cy: number; rx: number; ry: number }): SnailPose {
  const u = (TAU * snailCrawlHours(nowMs)) / SNAIL_LAP_HOURS;
  // A little unevenness in its pace, but always forward (1 + 0.12 * 7 < 2, so the warp is monotonic).
  const w = u + 0.12 * Math.sin(u * 7);
  const x = p.cx + p.rx * Math.cos(w);
  const y = p.cy + p.ry * Math.sin(w);
  // Direction of travel: d/dw of the loop.
  const dx = -p.rx * Math.sin(w);
  const dy = p.ry * Math.cos(w);
  const dir: 1 | -1 = dx >= 0 ? 1 : -1;
  const slope = Math.atan2(dy, Math.abs(dx) + 1e-6) * dir;
  const tilt = Math.max(-0.6, Math.min(0.6, slope));
  const h = nowMs / 3_600_000;
  const crawling = h - Math.floor(h / SNAIL_CYCLE_H) * SNAIL_CYCLE_H < SNAIL_CRAWL_H;
  return { x, y, dir, tilt, crawling };
}

// ---- the moth ------------------------------------------------------------------------------------

/** How visible the moth is: it comes out when the light is the night's and the bar is on. */
export function mothPresence(light: Daylight): number {
  return smoothstep(0.55, 0.85, light.night);
}

/** The moth's flight at time `tS`: loops in front of the light bar, never still, now and then gliding. */
export function mothPose(
  tS: number,
  a: readonly [number, number],
  b: readonly [number, number],
): { x: number; y: number; dir: 1 | -1; gliding: boolean } {
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  const half = Math.abs(b[0] - a[0]) / 2;
  const x = cx + half * 0.62 * Math.sin(tS * 0.73) + 5 * Math.sin(tS * 3.1 + 1.0) + 2 * Math.sin(tS * 7.3);
  const y = cy + 9 + 7 * Math.sin(tS * 1.27 + 0.5) + 2.5 * Math.sin(tS * 5.3);
  const vx = half * 0.62 * 0.73 * Math.cos(tS * 0.73) + 5 * 3.1 * Math.cos(tS * 3.1 + 1.0);
  return { x, y, dir: vx >= 0 ? 1 : -1, gliding: Math.sin(tS * 0.6) < -0.75 };
}

// ---- fireflies -----------------------------------------------------------------------------------

/** How many of the fireflies are out: none by day, a few at dusk, all of them at night. */
export function fireflyPresence(light: Daylight): number {
  return clamp01(smoothstep(0.35, 0.8, light.night) + 0.35 * smoothstep(0.5, 1, light.dusk));
}

/**
 * One firefly's light at time `tS`: dark most of the time, then a slow swell and fade, each on its own
 * period (5 to 9 s) so they never pulse together. 0..1.
 */
export function fireflyGlow(tS: number, phase: number): number {
  const period = 5 + 4 * (((phase * 7.13) % 1) + 1) % 1;
  const u = (((tS + phase * 11) / period) % 1 + 1) % 1;
  // lit for the first quarter of its period: up fast, down slow
  if (u > 0.26) return 0;
  const v = u / 0.26;
  return smoothstep(0, 0.25, v) * (1 - smoothstep(0.35, 1, v));
}

/** Where a firefly is at `tS`: a slow wandering loop inside `air`, its own for each `phase`. */
export function fireflyPos(tS: number, phase: number, air: Rect): { x: number; y: number } {
  const a = 0.11 + 0.07 * ((phase * 3.7) % 1);
  const b = 0.09 + 0.06 * ((phase * 5.3) % 1);
  const u = 0.5 + 0.36 * Math.sin(tS * a + phase * 6.1) + 0.12 * Math.sin(tS * a * 2.7 + phase * 2.3);
  const v = 0.5 + 0.32 * Math.sin(tS * b + phase * 4.4) + 0.14 * Math.sin(tS * b * 3.1 + phase * 1.7);
  return { x: air.x + air.w * clamp01(u), y: air.y + air.h * clamp01(v) };
}

// ---- the heat lamp, the doorway ----------------------------------------------------------------------

/** The heat lamp's glow: always on (it is what keeps a chick warm), stronger against the dark. */
export function lampGlow(light: Daylight, tS: number): number {
  const base = 0.16 * light.day + 0.26 * (light.dawn + light.dusk) + 0.5 * light.night;
  // an element's faint shimmer, never a flicker
  return base * (0.96 + 0.04 * Math.sin(tS * 2.3) * Math.sin(tS * 0.71));
}

/** The coop's doorway at night: the light inside spilling out, a little more with the hen home. */
export function doorGlow(light: Daylight, roosting: boolean): number {
  return clamp01(0.5 * smoothstep(0.4, 0.9, light.night) + 0.12 * smoothstep(0.6, 1, light.dusk)) * (roosting ? 1 : 0.8);
}

// ---- dust ----------------------------------------------------------------------------------------

/**
 * How lit a mote is at (x, y): it shows only where a beam of light crosses the air. By day the key
 * light comes in from the upper left, at dawn low from the right, at dusk low from the left; at night
 * the only light is the bar, a cone straight down from it.
 */
export function moteLight(
  x: number,
  y: number,
  light: Daylight,
  air: Rect,
  hood: readonly [readonly [number, number], readonly [number, number]] | null,
): number {
  const beam = (ox: number, oy: number, dx: number, dy: number, width: number): number => {
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const px = x - ox;
    const py = y - oy;
    const along = px * ux + py * uy;
    if (along < 0) return 0;
    const across = Math.abs(px * uy - py * ux);
    return Math.exp(-(across * across) / (width * width));
  };
  let v = 0;
  v += light.day * beam(air.x + air.w * 0.18, air.y - 10, 0.55, 1, air.w * 0.12);
  v += light.dawn * beam(air.x + air.w * 1.05, air.y + air.h * 0.1, -1, 0.42, air.h * 0.22);
  v += light.dusk * beam(air.x - air.w * 0.05, air.y + air.h * 0.2, 1, 0.3, air.h * 0.2);
  if (hood) {
    const [a, b] = hood;
    const inX = x >= Math.min(a[0], b[0]) - 8 && x <= Math.max(a[0], b[0]) + 8;
    const below = y - a[1];
    const cone = inX && below > 0 ? Math.exp(-below / (air.h * 0.9)) : 0;
    v += light.night * cone;
  }
  return clamp01(v);
}

/** The colour a light set gives a thing drawn in code: day is white, the others are measured. */
export function lightTint(light: Daylight, t: LightTints): number {
  const ch = (i: 0 | 1 | 2): number => light.day + light.dawn * t.dawn[i] + light.dusk * t.dusk[i] + light.night * t.night[i];
  const to8 = (v: number): number => Math.round(clamp01(v) * 255);
  return (to8(ch(0)) << 16) | (to8(ch(1)) << 8) | to8(ch(2));
}

function mulTint(a: number, b: number): number {
  const ch = (s: number): number => Math.round((((a >> s) & 0xff) * ((b >> s) & 0xff)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ---- the module ----------------------------------------------------------------------------------

export interface AmbientInput {
  dtMs: number;
  /** Wall-clock ms, for the snail. */
  nowMs: number;
  light: Daylight;
  alive: boolean;
  pet: { x: number; y: number; anim: string; act?: PetAct | string | undefined; facing: 1 | -1 };
  /** 0 when the hamster is not running the wheel; its pace (about 1) while it is. */
  wheelDrive: number;
  /** Step 5: where the frog's tongue is reaching (null: it is in its mouth). */
  reach?: { x: number; y: number; caught?: boolean } | null;
  /** The bug the hen is chasing (null: none). */
  bug?: { x: number; y: number } | null;
  /** The pet's species counters: the nest shows `eggs`. */
  counters?: Readonly<Record<string, number>> | undefined;
}

export interface Ambient {
  readonly back: Container;
  readonly front: Container;
  readonly top: Container;
  update(input: AmbientInput): void;
  onEvent(cb: (e: AmbientEvent) => void): void;
  debug(): Record<string, unknown>;
  destroy(): void;
}

interface Mote {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

interface Bit {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  kind: 'chip' | 'bubble' | 'drop' | 'puff';
  /** For a drop: still forming at the spout. */
  forming?: number;
}

const MOTES = 26;
/** How dark the contact shadow under a sprite pet is at its middle, by day. */
const PET_SHADOW = 0.34;
const DRINK_BUBBLE_EVERY_S = 1.3;

export function createAmbient(spec: AmbientSpec, textures: ReadonlyMap<string, Texture>, rng: () => number): Ambient {
  const back = new Container({ label: 'ambient:back' });
  const front = new Container({ label: 'ambient:front' });
  const top = new Container({ label: 'ambient:top' });
  let listener: ((e: AmbientEvent) => void) | null = null;
  const emit = (e: AmbientEvent): void => listener?.(e);
  let clock = 0;

  // -- textures drawn in code: a soft dot, a bubble ring, a drop, a bedding chip
  const dotTex = paintTexture(3, 3, 'ambient:mote', (nx, ny) => {
    const r = Math.hypot(nx, ny);
    return [1, 1, 1, Math.pow(1 - smoothstep(0, 1, r), 1.6)];
  });
  const ringTex = paintTexture(3, 3, 'ambient:bubble', (nx, ny) => {
    const r = Math.hypot(nx, ny);
    const rim = Math.exp(-Math.pow((r - 0.72) / 0.16, 2));
    const glint = Math.exp(-(Math.pow(nx + 0.3, 2) + Math.pow(ny + 0.35, 2)) / 0.03);
    return [1, 1, 1, Math.min(1, rim * 0.9 + glint * 0.8) * (r < 1 ? 1 : 0)];
  });
  const dropTex = paintTexture(2, 3, 'ambient:drop', (nx, ny) => {
    const r = Math.hypot(nx, (ny - 0.2) * 1.15);
    const a = 1 - smoothstep(0.7, 1.0, r);
    const hi = Math.exp(-(Math.pow(nx + 0.3, 2) + Math.pow(ny + 0.1, 2)) / 0.04);
    return [0.82 + 0.18 * hi, 0.92 + 0.08 * hi, 1, a * (0.55 + 0.45 * hi)];
  });
  const chipTex = paintTexture(2, 1.4, 'ambient:chip', (nx, ny) => {
    const a = (1 - smoothstep(0.75, 1, Math.abs(nx))) * (1 - smoothstep(0.6, 1, Math.abs(ny)));
    return [0.93, 0.82, 0.62, a];
  });
  const shadeTex = paintTexture(8, 8, 'ambient:shade', (nx, ny) => {
    const r = Math.hypot(nx, ny);
    return [0, 0, 0, 1 - smoothstep(0.45, 1, r)];
  });
  // Step 5: the tongue (a soft pink bar, stretched from the mouth), an egg, a bug, a wide warm glow
  const tongueTex = paintTexture(8, 2.4, 'ambient:tongue', (_nx, ny) => {
    const a = 1 - smoothstep(0.55, 1, Math.abs(ny));
    const hi = 1 - smoothstep(0, 0.6, Math.abs(ny + 0.25));
    return [0.93 + 0.07 * hi, 0.42 + 0.2 * hi, 0.5 + 0.18 * hi, a];
  });
  const eggTex = paintTexture(5.2, 6.6, 'ambient:egg', (nx, ny) => {
    // an egg: wider low down, narrower at the top
    const w = 0.86 - 0.16 * ny;
    const r = Math.hypot(nx / w, ny / 0.96);
    const a = 1 - smoothstep(0.86, 1, r);
    const lit = clamp01(0.74 + 0.26 * (1 - Math.hypot(nx + 0.35, ny + 0.4)));
    return [0.97 * lit, 0.9 * lit, 0.78 * lit, a];
  });
  const bugTex = paintTexture(3.6, 2.4, 'ambient:bug', (nx, ny) => {
    const body = 1 - smoothstep(0.7, 1, Math.hypot(nx / 0.8, ny / 0.62));
    const legs = (1 - smoothstep(0.1, 0.3, Math.abs(Math.sin(nx * 7)))) * (Math.abs(ny) > 0.5 ? 0.7 : 0);
    const hi = Math.exp(-(Math.pow(nx + 0.2, 2) + Math.pow(ny + 0.3, 2)) / 0.08);
    return [0.1 + 0.25 * hi, 0.09 + 0.22 * hi, 0.08 + 0.2 * hi, Math.max(body, legs)];
  });
  const glowTex = paintTexture(16, 16, 'ambient:glow', (nx, ny) => {
    const r = Math.hypot(nx, ny);
    return [1, 1, 1, Math.pow(1 - smoothstep(0, 1, r), 2)];
  });
  const made = [dotTex, ringTex, dropTex, chipTex, shadeTex, tongueTex, eggTex, bugTex, glowTex];

  // -- the wheel
  const wheelSpec = spec.wheel;
  const wheelFrames = (wheelSpec?.frames ?? []).map((f) => textures.get(f)).filter((t): t is Texture => t !== undefined);
  let wheel: { sprite: Sprite; state: WheelState; driving: boolean } | null = null;
  if (wheelSpec && wheelFrames.length > 0) {
    const first = wheelFrames[0] as Texture;
    const sprite = new Sprite({ texture: first, label: 'ambient:wheel' });
    // Art px per grid px, derived from the texture like every other layer.
    const art = first.width / wheelSpec.rect.w;
    sprite.scale.set(1 / art);
    // Pivot at the hub so the wobble turns about it.
    const [hx, hy] = wheelSpec.hub;
    sprite.anchor.set((hx - wheelSpec.rect.x) / wheelSpec.rect.w, (hy - wheelSpec.rect.y) / wheelSpec.rect.h);
    sprite.position.set(hx, hy);
    back.addChild(sprite);
    wheel = { sprite, state: { angle: 0, omega: 0 }, driving: false };
  }

  // -- the doorway's shade
  let door: { sprite: Sprite; t: number } | null = null;
  if (spec.door) {
    const d = spec.door;
    const sprite = new Sprite({ texture: spec.doorGlow ? glowTex : shadeTex, label: 'ambient:door' });
    sprite.anchor.set(0.5);
    if (spec.doorGlow) {
      // The coop's doorway: light from inside, spilling round the frame and onto the ramp.
      sprite.position.set(d.x + d.w / 2, d.y + d.h * 0.62);
      sprite.scale.set((d.w * 2.6) / (16 * FX_SS), (d.h * 2.3) / (16 * FX_SS));
      sprite.blendMode = 'add';
      sprite.tint = 0xffc27a;
    } else {
      sprite.position.set(d.x + d.w / 2, d.y + d.h * 0.58);
      sprite.scale.set((d.w * 0.95) / (8 * FX_SS) * 1, (d.h * 0.85) / (8 * FX_SS));
    }
    sprite.alpha = 0;
    back.addChild(sprite);
    door = { sprite, t: 0 };
  }

  // -- Step 5: the pet's contact shadow
  let petShadow: Sprite | null = null;
  if (spec.shadow) {
    petShadow = new Sprite({ texture: shadeTex, label: 'ambient:pet-shadow' });
    petShadow.anchor.set(0.5);
    petShadow.scale.set(spec.shadow.w / (8 * FX_SS), spec.shadow.h / (8 * FX_SS));
    petShadow.alpha = 0;
    back.addChild(petShadow);
  }

  // -- Step 5: the heat lamp's glow, over everything under it
  let lamp: Sprite | null = null;
  if (spec.lamp) {
    lamp = new Sprite({ texture: glowTex, label: 'ambient:lamp' });
    lamp.anchor.set(0.5);
    lamp.position.set(spec.lamp.at[0], spec.lamp.at[1] + spec.lamp.radius * 0.55);
    lamp.scale.set((spec.lamp.radius * 2.4) / (16 * FX_SS), (spec.lamp.radius * 2.9) / (16 * FX_SS));
    lamp.blendMode = 'add';
    lamp.tint = 0xff9a4d;
    lamp.alpha = 0;
    front.addChild(lamp);
  }

  // -- the nest: one egg per slot, shown as they are laid
  const eggs: Array<{ sprite: Sprite; grow: number }> = [];
  for (const [ex, ey] of spec.nest ?? []) {
    const sprite = new Sprite({ texture: eggTex, label: 'ambient:egg' });
    sprite.anchor.set(0.5, 0.9);
    sprite.position.set(ex, ey);
    sprite.rotation = (rng() - 0.5) * 0.5;
    sprite.visible = false;
    back.addChild(sprite);
    eggs.push({ sprite, grow: 0 });
  }
  /** Eggs shown last frame; -1 until the first, so a nest that is already full does not announce itself. */
  let eggsShown = -1;

  // -- fireflies
  const flies: Array<{ sprite: Sprite; halo: Sprite; phase: number }> = [];
  if (spec.fireflies && spec.air) {
    for (let i = 0; i < spec.fireflies.count; i += 1) {
      const halo = new Sprite({ texture: glowTex, label: 'ambient:firefly-halo' });
      halo.anchor.set(0.5);
      halo.scale.set(14 / (16 * FX_SS));
      halo.blendMode = 'add';
      halo.tint = 0xc8f03c;
      halo.alpha = 0;
      const sprite = new Sprite({ texture: dotTex, label: 'ambient:firefly' });
      sprite.anchor.set(0.5);
      sprite.scale.set(2.2 / (3 * FX_SS));
      sprite.blendMode = 'add';
      sprite.tint = 0xf1ff9a;
      sprite.alpha = 0;
      top.addChild(halo);
      top.addChild(sprite);
      flies.push({ sprite, halo, phase: rng() });
    }
  }
  let fliesOut = false;

  // -- the frog's tongue, and whatever is on the end of it
  let tongue: { bar: Sprite; tip: Sprite; len: number; to: { x: number; y: number }; caught: boolean; out: boolean } | null = null;
  if (spec.tongue) {
    const bar = new Sprite({ texture: tongueTex, label: 'ambient:tongue' });
    bar.anchor.set(0, 0.5);
    bar.visible = false;
    const tip = new Sprite({ texture: dotTex, label: 'ambient:tongue-tip' });
    tip.anchor.set(0.5);
    tip.visible = false;
    front.addChild(bar);
    front.addChild(tip);
    tongue = { bar, tip, len: 0, to: { x: 0, y: 0 }, caught: false, out: false };
  }

  // -- the bug the hen chases
  let bug: Sprite | null = null;
  if (spec.nest) {
    bug = new Sprite({ texture: bugTex, label: 'ambient:bug' });
    bug.anchor.set(0.5, 0.8);
    bug.scale.set(1 / FX_SS);
    bug.visible = false;
    front.addChild(bug);
  }
  let lastBugX = 0;
  let croaking = false;
  let scratching = false;
  let bathing = false;
  let puffClock = 0;

  // -- dust
  const motes: Mote[] = [];
  if (spec.air) {
    const a = spec.air;
    for (let i = 0; i < MOTES; i += 1) {
      const sprite = new Sprite({ texture: dotTex, label: 'ambient:mote' });
      sprite.anchor.set(0.5);
      const size = 0.35 + rng() * 0.3;
      sprite.scale.set((size * 3) / (3 * FX_SS));
      sprite.blendMode = 'add';
      sprite.alpha = 0;
      front.addChild(sprite);
      motes.push({ sprite, x: a.x + rng() * a.w, y: a.y + rng() * a.h, vx: (rng() - 0.5) * 2, vy: (rng() - 0.5) * 2, phase: rng() * TAU });
    }
  }

  // -- bits: bubbles in the bottle, drips, bedding chips
  const bits: Bit[] = [];
  const spawn = (kind: Bit['kind'], x: number, y: number, vx: number, vy: number, life: number): Bit => {
    const tex = kind === 'chip' ? chipTex : kind === 'bubble' ? ringTex : kind === 'puff' ? glowTex : dropTex;
    const sprite = new Sprite({ texture: tex, label: `ambient:${kind}` });
    sprite.anchor.set(0.5);
    sprite.scale.set(1 / FX_SS);
    sprite.position.set(x, y);
    front.addChild(sprite);
    const b: Bit = { sprite, x, y, vx, vy, age: 0, life, kind };
    bits.push(b);
    return b;
  };
  let drinkClock = 0;
  let nextDrip = 20 + rng() * 40;
  let digClock = 0;
  let wasDigging = false;

  // -- the critter
  const critSpec = spec.critter;
  const critFrames = (critSpec?.frames ?? []).map((f) => textures.get(f)).filter((t): t is Texture => t !== undefined);
  let critter: { sprite: Sprite; seen: number } | null = null;
  if (critSpec && critFrames.length > 0) {
    const first = critFrames[0] as Texture;
    const sprite = new Sprite({ texture: first, label: `ambient:${critSpec.kind}` });
    sprite.anchor.set(0.5, critSpec.kind === 'snail' ? 0.8 : 0.5);
    sprite.scale.set(critSpec.size[0] / first.width, critSpec.size[1] / first.height);
    (critSpec.kind === 'moth' ? top : front).addChild(sprite);
    sprite.visible = false;
    critter = { sprite, seen: 0 };
  }
  let snailWasCrawling = false;
  let hoodOn = false;

  const ambient: Ambient = {
    back,
    front,
    top,
    onEvent(cb) {
      listener = cb;
    },
    update(input) {
      const dt = Math.max(0, input.dtMs) / 1000;
      clock += dt;
      const tint = spec.tints ? lightTint(input.light, spec.tints) : 0xffffff;

      // the night light
      const on = input.light.night > 0.5;
      if (spec.hood && on !== hoodOn) {
        hoodOn = on;
        emit(on ? 'hood_on' : 'hood_off');
      }

      // the wheel: driven while it runs, coasting down after it hops off
      if (wheel && wheelSpec) {
        const driving = input.alive && input.wheelDrive > 0;
        if (driving && !wheel.driving) emit('wheel_spin');
        if (!driving && wheel.driving && Math.abs(wheel.state.omega) > 0.5) emit('wheel_coast');
        wheel.driving = driving;
        wheel.state = wheelStep(wheel.state, driving ? input.wheelDrive : 0, dt);
        const loop = (wheelSpec.loopDeg * Math.PI) / 180;
        const tex = wheelFrames[wheelFrame(wheel.state.angle, loop, wheelFrames.length)];
        if (tex) wheel.sprite.texture = tex;
        // A cheap wheel wobbles on its axle as it turns, more the faster it goes.
        const k = Math.min(1, Math.abs(wheel.state.omega) / WHEEL_RUN_OMEGA);
        wheel.sprite.rotation = 0.012 * k * Math.sin(wheel.state.angle * 2);
        wheel.sprite.tint = lightTint(input.light, wheelSpec.tints);
      }

      // the doorway: darker while the hamster sleeps by its house
      if (door && spec.door) {
        const d = spec.door;
        const near = Math.abs(input.pet.x - (d.x + d.w / 2)) < d.w * 1.4;
        const home = input.alive && input.pet.anim === 'sleep' && near;
        const want = spec.doorGlow ? doorGlow(input.light, home) : home ? 0.42 : 0.06;
        door.t += (want - door.t) * (1 - Math.exp(-dt / 1.5));
        door.sprite.alpha = door.t;
      }

      // the pet's shadow: under its feet, fainter while it is off the ground and in the dark
      if (petShadow && spec.shadow) {
        const want = input.alive ? PET_SHADOW * (input.pet.act === 'hop' ? 0.35 : 1) * (1 - 0.45 * input.light.night) : 0;
        petShadow.alpha += (want - petShadow.alpha) * (1 - Math.exp(-dt / 0.12));
        petShadow.position.set(input.pet.x, input.pet.y + spec.shadow.below);
      }

      // the heat lamp
      if (lamp) lamp.alpha = lampGlow(input.light, clock);

      // the nest: an egg appears where the next one goes, settling into the straw
      if (eggs.length > 0) {
        const n = Math.min(eggs.length, Math.max(0, Math.floor(input.counters?.['eggs'] ?? 0)));
        if (eggsShown >= 0 && n > eggsShown) emit('egg_laid');
        for (let i = 0; i < eggs.length; i += 1) {
          const e = eggs[i]!;
          const show = i < n;
          if (show && !e.sprite.visible) e.grow = eggsShown < 0 ? 1 : 0;
          e.sprite.visible = show;
          if (!show) continue;
          e.grow = Math.min(1, e.grow + dt / 0.45);
          const g = 1 - Math.pow(1 - e.grow, 3);
          e.sprite.scale.set((0.6 + 0.4 * g) / FX_SS, (0.6 + 0.4 * g + 0.12 * Math.sin(Math.PI * g)) / FX_SS);
          e.sprite.alpha = Math.min(1, e.grow * 3);
          e.sprite.tint = tint;
        }
        eggsShown = n;
      }

      // fireflies: out with the dark, each on its own slow pulse
      if (flies.length > 0 && spec.air) {
        const out = fireflyPresence(input.light);
        if (out > 0.5 !== fliesOut) {
          fliesOut = out > 0.5;
          if (fliesOut) emit('fireflies_out');
        }
        flies.forEach((f, i) => {
          // they come out one by one as it gets darker
          const mine = clamp01(out * flies.length - i);
          const p = fireflyPos(clock, f.phase, spec.air as Rect);
          const g = fireflyGlow(clock, f.phase) * mine;
          f.sprite.position.set(p.x, p.y);
          f.halo.position.set(p.x, p.y);
          f.sprite.alpha = 0.18 * mine + 0.82 * g;
          f.halo.alpha = 0.7 * g;
        });
      }

      // the tongue: out to where it reaches in a few frames, back in as fast
      if (tongue && spec.tongue) {
        const r = input.alive ? (input.reach ?? null) : null;
        if (r) {
          if (!tongue.out) emit('tongue_snap');
          tongue.to = { x: r.x, y: r.y };
          tongue.caught = r.caught === true;
        }
        tongue.out = r !== null;
        const rate = dt / 0.07;
        tongue.len = clamp01(tongue.len + (tongue.out ? rate : -rate));
        if (tongue.len <= 0) tongue.caught = false;
        const mx = input.pet.x + input.pet.facing * spec.tongue.mouth[0];
        const my = input.pet.y + spec.tongue.mouth[1];
        const dx = tongue.to.x - mx;
        const dy = tongue.to.y - my;
        const full = Math.hypot(dx, dy);
        const show = tongue.len > 0.02 && full > 1;
        tongue.bar.visible = show;
        tongue.tip.visible = show;
        if (show) {
          const len = full * tongue.len;
          tongue.bar.position.set(mx, my);
          tongue.bar.rotation = Math.atan2(dy, dx);
          tongue.bar.scale.set(len / (8 * FX_SS), 1 / FX_SS);
          tongue.bar.tint = tint;
          const tx = mx + (dx / full) * len;
          const ty = my + (dy / full) * len;
          tongue.tip.position.set(tx, ty);
          // the sticky end; darker and larger with a cricket on it
          tongue.tip.scale.set((tongue.caught ? 5.2 : 3.6) / (3 * FX_SS));
          tongue.tip.tint = mulTint(tint, tongue.caught ? 0x4a3220 : 0xf07a8c);
        }
      }

      // the bug: scuttling ahead of the hen, legs going
      if (bug) {
        const b = input.alive ? (input.bug ?? null) : null;
        bug.visible = b !== null;
        if (b) {
          const dir = b.x >= lastBugX ? 1 : -1;
          lastBugX = b.x;
          bug.position.set(b.x, b.y + 0.4 * Math.sin(clock * 38));
          bug.scale.set(dir / FX_SS, 1 / FX_SS);
          bug.rotation = 0.12 * Math.sin(clock * 31);
          bug.tint = tint;
        }
      }

      // sounds for what the pet is doing
      const nowCroaking = input.alive && input.pet.act === 'croak';
      if (nowCroaking && !croaking) emit('frog_croak');
      croaking = nowCroaking;
      const nowScratching = input.alive && input.pet.act === 'scratch';
      if (nowScratching && !scratching) emit('hen_scratch');
      scratching = nowScratching;
      const nowBathing = input.alive && input.pet.act === 'dustbathe';
      if (nowBathing && !bathing) emit('dust_bath');
      bathing = nowBathing;
      // a dust bath: soft clouds of dust off her back
      if (nowBathing) {
        puffClock += dt;
        while (puffClock >= 0.16) {
          puffClock -= 0.16;
          spawn('puff', input.pet.x + (rng() - 0.5) * 22, input.pet.y + 6 + rng() * 6, (rng() - 0.5) * 16, -(6 + rng() * 12), 0.9 + rng() * 0.5);
        }
      } else {
        puffClock = 0;
      }

      // dust: drifting, lit only where a beam crosses it
      if (spec.air) {
        const a = spec.air;
        const amount = 0.25 + 0.75 * (input.light.day + 0.8 * input.light.dawn + 0.8 * input.light.dusk) + 0.6 * input.light.night;
        const hoodTint = 0xffd7a0;
        const moteTint = input.light.night > 0.5 ? mulTint(hoodTint, 0xffffff) : mulTint(tint, 0xfff4e6);
        for (const m of motes) {
          m.vx += (rng() - 0.5) * 6 * dt;
          m.vy += (rng() - 0.5) * 6 * dt - 0.15 * dt;
          m.vx *= 1 - 0.6 * dt;
          m.vy *= 1 - 0.6 * dt;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          if (m.x < a.x) m.x += a.w;
          if (m.x > a.x + a.w) m.x -= a.w;
          if (m.y < a.y) m.y += a.h;
          if (m.y > a.y + a.h) m.y -= a.h;
          const lit = moteLight(m.x, m.y, input.light, a, spec.hood ?? null);
          const twinkle = 0.65 + 0.35 * Math.sin(clock * 1.7 + m.phase);
          m.sprite.position.set(m.x, m.y);
          m.sprite.alpha = 0.55 * lit * twinkle * Math.min(1, amount);
          m.sprite.tint = moteTint;
        }
      }

      // the bottle: a bubble rises each swallow while it drinks; a drop forms and falls now and then
      if (spec.bottle) {
        const b = spec.bottle;
        if (input.alive && input.pet.act === 'drink') {
          drinkClock += dt;
          if (drinkClock >= DRINK_BUBBLE_EVERY_S) {
            drinkClock = 0;
            const bx = b.water.x + b.water.w * (0.4 + rng() * 0.2);
            spawn('bubble', bx, b.water.y + b.water.h - 1.5, (rng() - 0.5) * 2, -b.water.h / 0.9, 0.9);
            emit('bottle_drink');
          }
        } else {
          drinkClock = DRINK_BUBBLE_EVERY_S * 0.7;
        }
        nextDrip -= dt;
        if (nextDrip <= 0) {
          nextDrip = 25 + rng() * 45;
          const d = spawn('drop', b.spout[0], b.spout[1], 0, 0, 3.2);
          d.forming = 1.4;
          d.sprite.scale.set(0);
        }
      }

      // a dig: bedding thrown back from its front paws
      const digging = input.alive && input.pet.act === 'dig';
      if (digging && !wasDigging) emit('bedding_dig');
      wasDigging = digging;
      // a hen scratching throws litter the same way, less of it
      const throwing = digging || (input.alive && input.pet.act === 'scratch');
      if (throwing) {
        digClock += dt;
        const every = digging ? 0.09 : 0.2;
        while (digClock >= every) {
          digClock -= every;
          const dir = -input.pet.facing;
          spawn('chip', input.pet.x - dir * 6, input.pet.y + 6, dir * (25 + rng() * 35), -(35 + rng() * 45), 0.6 + rng() * 0.3);
        }
      } else {
        digClock = 0;
      }

      for (let i = bits.length - 1; i >= 0; i -= 1) {
        const bit = bits[i] as Bit;
        if (bit.kind === 'drop' && bit.forming !== undefined && bit.forming > 0) {
          bit.forming -= dt;
          const g = clamp01(1 - bit.forming / 1.4);
          bit.sprite.scale.set((g * 0.9) / FX_SS, (g * 1.0) / FX_SS);
          bit.sprite.position.set(bit.x, bit.y + g * 0.8);
          bit.sprite.tint = tint;
          if (bit.forming <= 0) {
            bit.forming = 0;
            bit.age = 0;
            emit('bottle_drip');
          }
          continue;
        }
        bit.age += dt;
        if (bit.kind === 'chip') bit.vy += 260 * dt;
        if (bit.kind === 'drop') bit.vy += 420 * dt;
        bit.x += bit.vx * dt;
        bit.y += bit.vy * dt;
        let a = 1;
        if (bit.kind === 'bubble') {
          const t = bit.age / bit.life;
          bit.sprite.scale.set((0.45 + 0.25 * t) / FX_SS);
          a = smoothstep(0, 0.15, t) * (1 - smoothstep(0.75, 1, t));
          bit.x += Math.sin(bit.age * 14) * 0.08;
          if (spec.bottle && bit.y <= spec.bottle.water.y + 1) bit.age = bit.life;
        } else if (bit.kind === 'puff') {
          const t = bit.age / bit.life;
          bit.sprite.scale.set((5 + 9 * t) / (16 * FX_SS));
          a = 0.34 * smoothstep(0, 0.2, t) * (1 - smoothstep(0.4, 1, t));
          bit.vx *= 1 - 1.5 * dt;
          bit.vy *= 1 - 1.5 * dt;
          bit.sprite.tint = mulTint(tint, 0xd9c3a0);
        } else if (bit.kind === 'chip') {
          bit.sprite.rotation += dt * 9 * (bit.vx > 0 ? 1 : -1);
          a = 1 - smoothstep(0.6, 1, bit.age / bit.life);
        } else if (bit.kind === 'drop') {
          if (spec.bottle && bit.y >= spec.bottle.dropTo) bit.age = bit.life;
        }
        bit.sprite.position.set(bit.x, bit.y);
        bit.sprite.alpha = a;
        if (bit.kind !== 'bubble' && bit.kind !== 'puff') bit.sprite.tint = tint;
        if (bit.age >= bit.life) {
          bit.sprite.destroy();
          bits.splice(i, 1);
        }
      }

      // the critter
      if (critter && critSpec) {
        const sp = critter.sprite;
        if (critSpec.kind === 'snail' && critSpec.path) {
          const pose = snailPose(input.nowMs, critSpec.path);
          if (pose.crawling && !snailWasCrawling) emit('snail_crawl');
          snailWasCrawling = pose.crawling;
          sp.visible = true;
          sp.position.set(pose.x, pose.y);
          sp.rotation = pose.tilt;
          sp.scale.x = Math.abs(sp.scale.x) * pose.dir;
          // the foot's slow pulse while it crawls; still while it rests
          const f = pose.crawling ? Math.floor(clock * critSpec.fps) % critFrames.length : 0;
          const tex = critFrames[f];
          if (tex) sp.texture = tex;
          // under water: a touch of the water's blue, and the light of the hour
          sp.tint = mulTint(tint, 0xd6ecf4);
        } else if (critSpec.kind === 'moth' && spec.hood) {
          const v = mothPresence(input.light);
          if (v > 0.5 && critter.seen <= 0.5) emit('moth_flutter');
          critter.seen = v;
          sp.visible = v > 0.01;
          if (sp.visible) {
            const pose = mothPose(clock, spec.hood[0], spec.hood[1]);
            sp.position.set(pose.x, pose.y);
            sp.scale.x = Math.abs(sp.scale.x) * pose.dir;
            const f = pose.gliding ? 1 : Math.floor(clock * critSpec.fps) % critFrames.length;
            const tex = critFrames[f];
            if (tex) sp.texture = tex;
            sp.alpha = v;
            // lit by the bar it circles: warm, whatever the moon is doing
            sp.tint = 0xffd9a8;
          }
        }
      }
    },
    debug() {
      return {
        wheel: wheel ? { omega: Math.round(wheel.state.omega * 100) / 100, driving: wheel.driving } : null,
        door: door ? Math.round(door.t * 100) / 100 : null,
        motes: motes.length,
        bits: bits.length,
        critter: critter ? { kind: critSpec?.kind, visible: critter.sprite.visible, x: Math.round(critter.sprite.x), y: Math.round(critter.sprite.y) } : null,
        hood: hoodOn,
        ...(lamp ? { lamp: Math.round(lamp.alpha * 100) / 100 } : {}),
        ...(eggs.length > 0 ? { eggs: eggs.filter((e) => e.sprite.visible).length } : {}),
        ...(flies.length > 0 ? { fireflies: flies.filter((f) => f.sprite.alpha > 0.01).length } : {}),
        ...(tongue ? { tongue: Math.round(tongue.len * 100) / 100 } : {}),
        ...(bug ? { bug: bug.visible } : {}),
      };
    },
    destroy() {
      back.destroy({ children: true });
      front.destroy({ children: true });
      top.destroy({ children: true });
      for (const t of made) t.destroy(true);
    },
  };
  return ambient;
}
