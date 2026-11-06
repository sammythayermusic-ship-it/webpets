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
  | 'hood_off';

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
  kind: 'chip' | 'bubble' | 'drop';
  /** For a drop: still forming at the spout. */
  forming?: number;
}

const MOTES = 26;
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
  const made = [dotTex, ringTex, dropTex, chipTex, shadeTex];

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
    const sprite = new Sprite({ texture: shadeTex, label: 'ambient:door' });
    sprite.anchor.set(0.5);
    sprite.position.set(d.x + d.w / 2, d.y + d.h * 0.58);
    sprite.scale.set((d.w * 0.95) / (8 * FX_SS) * 1, (d.h * 0.85) / (8 * FX_SS));
    sprite.alpha = 0;
    back.addChild(sprite);
    door = { sprite, t: 0 };
  }

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
    const tex = kind === 'chip' ? chipTex : kind === 'bubble' ? ringTex : dropTex;
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
        const want = input.alive && input.pet.anim === 'sleep' && near ? 0.42 : 0.06;
        door.t += (want - door.t) * (1 - Math.exp(-dt / 1.5));
        door.sprite.alpha = door.t;
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
      if (digging) {
        digClock += dt;
        while (digClock >= 0.09) {
          digClock -= 0.09;
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
        } else if (bit.kind === 'chip') {
          bit.sprite.rotation += dt * 9 * (bit.vx > 0 ? 1 : -1);
          a = 1 - smoothstep(0.6, 1, bit.age / bit.life);
        } else if (bit.kind === 'drop') {
          if (spec.bottle && bit.y >= spec.bottle.dropTo) bit.age = bit.life;
        }
        bit.sprite.position.set(bit.x, bit.y);
        bit.sprite.alpha = a;
        if (bit.kind !== 'bubble') bit.sprite.tint = tint;
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
