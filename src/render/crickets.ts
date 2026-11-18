// Crickets: what the frog eats. A feed lets three loose on the bank in front of the pond; they hop
// along it, the frog turns and waits, and its tongue takes the one that comes in range. A cricket
// nobody caught in twenty seconds, or one the tongue missed, makes for the edge and is gone
// (Blueprint §8: "feeding is a show; a missed cricket escapes after 20 s").
//
// The same `Flakes` contract as falling food, so the scene, the behaviour's `flakes` input and the
// bite index all work unchanged: a cricket is food that moves by itself. The meal itself was credited
// by the sim at the feed (DECISIONS 2026-11-17), so an escape costs the frog nothing but the show.
//
// The motion is a pure step function (`cricketStep`), exported for the tests. Sizes and speeds are in
// grid px and 8 Hz steps, like the flakes'.

import { Container, Sprite } from 'pixi.js';
import { FX_SS, paintTexture, smoothstep } from './fx';
import type { Flakes } from './food';
import type { Rng } from '../sim/types';

export const CRICKETS_PER_FEED = 3;
/** Steps a cricket stays before it gives up on the bank and leaves: 20 s. */
export const CRICKET_ESCAPE_STEPS = 160;
/** Steps one hop takes, and how high it goes, grid px. */
export const HOP_STEPS = 3;
const HOP_HEIGHT = 5;
/** A hop's length, and the rest between hops, in steps. */
const HOP_MIN = 7;
const HOP_MAX = 15;
const REST_MIN = 5;
const REST_MAX = 22;
/** A fleeing cricket: longer, quicker hops with no rest between. */
const FLEE_HOP = 20;
/** How far past the end of the bank a cricket has to get before it is gone. */
const EXIT_MARGIN = 10;

export interface CricketSpec {
  /** The stretch of bank they hop along, and its row, grid px. */
  x0: number;
  x1: number;
  y: number;
}

export interface CricketState {
  /** Where it is standing (or took off from), and where the current hop lands. */
  x: number;
  toX: number;
  /** Steps into the current hop; 0 while resting. */
  hop: number;
  /** Steps left of this rest. */
  rest: number;
  /** Steps since it was let loose. */
  age: number;
  fleeing: boolean;
  /** Its own small offset from the bank's row, so three crickets are not on one line. */
  row: number;
  gone: boolean;
}

/** Where a cricket is drawn `t` of the way through the current step: along its hop, and up its arc. */
export function cricketPos(c: CricketState, spec: CricketSpec, t = 0): { x: number; y: number; air: number } {
  if (c.hop <= 0) return { x: c.x, y: spec.y + c.row, air: 0 };
  const u = Math.min(1, (c.hop - 1 + t) / HOP_STEPS);
  const air = Math.sin(Math.PI * u);
  return { x: c.x + (c.toX - c.x) * u, y: spec.y + c.row - HOP_HEIGHT * air * (c.fleeing ? 1.3 : 1), air };
}

/** One 8 Hz step of one cricket. Mutates and returns it. */
export function cricketStep(c: CricketState, spec: CricketSpec, rng: Rng): CricketState {
  if (c.gone) return c;
  c.age += 1;
  if (c.age >= CRICKET_ESCAPE_STEPS) c.fleeing = true;
  if (c.hop > 0) {
    c.hop += 1;
    if (c.hop > HOP_STEPS) {
      // landed
      c.x = c.toX;
      c.hop = 0;
      c.rest = c.fleeing ? 0 : REST_MIN + Math.floor(rng() * (REST_MAX - REST_MIN + 1));
      if (c.x < spec.x0 - EXIT_MARGIN || c.x > spec.x1 + EXIT_MARGIN) c.gone = true;
    }
    return c;
  }
  if (c.rest > 0) {
    c.rest -= 1;
    return c;
  }
  // take off
  if (c.fleeing) {
    // for the nearer end of the bank, and off it
    const mid = (spec.x0 + spec.x1) / 2;
    c.toX = c.x + (c.x >= mid ? 1 : -1) * FLEE_HOP;
  } else {
    const len = HOP_MIN + rng() * (HOP_MAX - HOP_MIN);
    let dir = rng() < 0.5 ? -1 : 1;
    // turn back from the ends rather than hopping off by accident
    if (c.x + dir * len > spec.x1) dir = -1;
    if (c.x + dir * len < spec.x0) dir = 1;
    c.toX = c.x + dir * len;
  }
  c.hop = 1;
  return c;
}

/** Cricket size in grid px. */
const CRICKET_W = 9;
const CRICKET_H = 6;

interface Cricket extends CricketState {
  sprite: Sprite;
}

/** Crickets for one habitat, as food (see the file comment). */
export function createCrickets(spec: CricketSpec): Flakes {
  const container = new Container({ label: 'crickets' });
  // A cricket, facing right: a dark body, a head, and the bent hind leg standing above its back.
  const tex = paintTexture(CRICKET_W, CRICKET_H, 'cricket', (nx, ny) => {
    const body = 1 - smoothstep(0.75, 1, Math.hypot((nx + 0.05) / 0.72, (ny - 0.25) / 0.5));
    const head = 1 - smoothstep(0.7, 1, Math.hypot((nx - 0.62) / 0.3, (ny - 0.2) / 0.42));
    // the hind leg: a thin arch from the back of the body, up and forward
    const lx = nx + 0.35;
    const arch = -0.75 + 2.2 * lx * lx;
    const leg = Math.abs(lx) < 0.5 ? 1 - smoothstep(0.08, 0.22, Math.abs(ny - arch)) : 0;
    const a = Math.max(body, head, leg * 0.9);
    const lift = (1 - smoothstep(-0.5, 0.4, ny)) * 0.22 * body;
    return [0.2 + lift, 0.13 + lift * 0.8, 0.07 + lift * 0.5, a];
  });
  const crickets: Cricket[] = [];

  const draw = (c: Cricket, t: number): void => {
    const p = cricketPos(c, spec, t);
    c.sprite.position.set(p.x, p.y);
    const dir = c.toX >= c.x ? 1 : -1;
    // stretched in the air, level on the ground
    c.sprite.scale.set((dir * (1 + 0.15 * p.air)) / FX_SS, (1 - 0.1 * p.air) / FX_SS);
    c.sprite.rotation = -dir * 0.35 * Math.cos(Math.PI * Math.min(1, c.hop > 0 ? (c.hop - 1 + t) / HOP_STEPS : 0.5)) * (c.hop > 0 ? 1 : 0);
  };

  const kill = (c: Cricket): void => {
    c.sprite.destroy();
  };

  return {
    container,
    feed(rng) {
      for (let i = 0; i < CRICKETS_PER_FEED; i += 1) {
        const sprite = new Sprite({ texture: tex, anchor: { x: 0.5, y: 0.85 } });
        sprite.scale.set(1 / FX_SS);
        container.addChild(sprite);
        // Let loose from one end, hopping in: the first hop carries each onto the bank.
        const fromLeft = rng() < 0.5;
        const x = fromLeft ? spec.x0 - EXIT_MARGIN * 0.5 : spec.x1 + EXIT_MARGIN * 0.5;
        const span = spec.x1 - spec.x0;
        const land = fromLeft ? spec.x0 + span * (0.08 + 0.3 * rng()) : spec.x1 - span * (0.08 + 0.3 * rng());
        const c: Cricket = { sprite, x, toX: land, hop: 1, rest: 0, age: -i * 3, fleeing: false, row: (i - 1) * 2.5 + (rng() - 0.5), gone: false };
        crickets.push(c);
        draw(c, 0);
      }
    },
    step(rng) {
      let left = 0;
      for (let i = crickets.length - 1; i >= 0; i -= 1) {
        const c = crickets[i] as Cricket;
        cricketStep(c, spec, rng);
        if (c.gone) {
          kill(c);
          crickets.splice(i, 1);
          left += 1;
        }
      }
      return left;
    },
    interpolate(t) {
      const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
      for (const c of crickets) draw(c, clamped);
    },
    positions() {
      return crickets.map((c) => {
        const p = cricketPos(c, spec, 0);
        return { x: Math.round(p.x), y: Math.round(p.y) };
      });
    },
    remove(index) {
      const c = crickets[index];
      if (!c) return;
      kill(c);
      crickets.splice(index, 1);
    },
    scare(index) {
      const c = crickets[index];
      if (!c) return;
      c.fleeing = true;
      c.rest = 0;
    },
    count() {
      return crickets.length;
    },
    clear() {
      for (const c of crickets) kill(c);
      crickets.length = 0;
    },
    destroy() {
      for (const c of crickets) kill(c);
      crickets.length = 0;
      container.destroy({ children: true });
      tex.destroy(true);
    },
  };
}
