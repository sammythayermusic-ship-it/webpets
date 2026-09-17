// Sprite player: a strip PNG per state → per-frame Textures; sequences/loop/returnTo via the sequencer;
// mirror via scale.x with anchor 0.5; turning = half width for one step; integer per-frame offsets;
// transform fallback (bob/squash) for states without a strip. Advances only on step().

import { Rectangle, Sprite, Texture } from 'pixi.js';
import { createSequencer, type SequenceDef } from './sequencer';
import type { ManifestSprite } from './types';

export interface SpritePlayer {
  readonly sprite: Sprite;
  play(state: string): void;
  /** One 8 fps step: advance the sequence and refresh the drawn frame. */
  step(): void;
  /** `turning` draws the current step at half width with the previous facing (nearest, integer edges). */
  setFacing(facing: 1 | -1, turning: boolean): void;
  /** Integer grid px of the body center. */
  setPosition(x: number, y: number): void;
  setReducedMotion(b: boolean): void;
  state(): string;
  destroy(): void;
}

/** Bob/squash fallback for states whose strip is missing. Stepped, integer, nearest-safe. */
const FALLBACK_SEQUENCES: Readonly<Record<string, SequenceDef>> = {
  idle: { sequence: [0, 0, 0, 0, 1, 1, 1, 1], loop: true },
  eat: { sequence: [0, 1, 1, 0], loop: false, returnTo: 'idle' },
  hungry: { sequence: [0, 0, 0, 1, 1, 1], loop: true },
  sleep: { sequence: [0, 0, 0, 0, 1, 1, 1, 1], loop: true },
  dead: { sequence: [0, 0, 0, 0, 1, 1, 1, 1], loop: true },
};

export function createSpritePlayer(
  def: ManifestSprite,
  strips: ReadonlyMap<string, Texture>,
  initial = 'idle',
): SpritePlayer {
  const [fw, fh] = def.frame;
  const frames = new Map<string, Texture[]>();
  for (const [name, state] of Object.entries(def.states)) {
    const strip = strips.get(state.file);
    if (!strip) continue;
    const list: Texture[] = [];
    for (let i = 0; i < state.frames; i += 1) {
      list.push(new Texture({ source: strip.source, frame: new Rectangle(i * fw, 0, fw, fh), label: `${name}#${i}` }));
    }
    frames.set(name, list);
  }
  const fallbackBase = (() => {
    for (const list of frames.values()) {
      const first = list[0];
      if (first) return first;
    }
    return Texture.WHITE;
  })();

  // Sequences: manifest states with a strip play their own sequence; anything else uses the fallback table.
  const sequences: Record<string, SequenceDef> = {};
  for (const [name, state] of Object.entries(def.states)) {
    if (frames.has(name)) sequences[name] = { sequence: state.sequence, loop: state.loop, ...(state.returnTo !== undefined ? { returnTo: state.returnTo } : {}) };
  }
  for (const [name, seq] of Object.entries(FALLBACK_SEQUENCES)) {
    if (sequences[name] === undefined) sequences[name] = seq;
  }
  const seq = createSequencer(sequences, initial);

  const sprite = new Sprite({ texture: fallbackBase, anchor: 0.5, roundPixels: true });
  let facing: 1 | -1 = 1;
  let prevFacing: 1 | -1 = 1;
  let turning = false;
  let px = 0;
  let py = 0;
  let reducedMotion = false;
  let stepCount = 0;

  const refresh = (): void => {
    const state = seq.state();
    const frame = seq.frame();
    const list = frames.get(state);
    let dx = 0;
    let dy = 0;
    let sy = 1;
    if (list) {
      sprite.texture = list[frame] ?? fallbackBase;
      const off = def.states[state]?.offsets?.[frame];
      if (off) {
        dx = off[0];
        dy = off[1];
      }
    } else {
      // Transform fallback: the base frame with a stepped bob / squash / flip.
      sprite.texture = fallbackBase;
      switch (state) {
        case 'eat':
          sy = frame === 1 ? 0.75 : 1; // 80 → 60 px, integer
          break;
        case 'dead':
          sy = -1; // belly-up
          dy = frame === 1 ? 1 : 0;
          break;
        case 'hungry':
          dy = 2 + (reducedMotion ? 0 : frame);
          break;
        case 'sleep':
          dy = reducedMotion ? 0 : frame;
          break;
        default:
          dy = reducedMotion ? 0 : frame === 1 ? -1 : 0;
      }
    }
    sprite.scale.set(turning ? 0.5 * prevFacing : facing, sy);
    sprite.position.set(Math.round(px + dx * facing), Math.round(py + dy));
  };

  refresh();

  return {
    sprite,
    play(state) {
      seq.play(state);
      refresh();
    },
    step() {
      stepCount += 1;
      seq.step();
      refresh();
    },
    setFacing(f, t) {
      if (t) {
        prevFacing = facing === f ? prevFacing : facing;
      } else {
        prevFacing = f;
      }
      facing = f;
      turning = t;
      refresh();
    },
    setPosition(x, y) {
      px = Math.round(x);
      py = Math.round(y);
      refresh();
    },
    setReducedMotion(b) {
      reducedMotion = b;
      refresh();
    },
    state() {
      return seq.state();
    },
    destroy() {
      sprite.destroy();
      for (const list of frames.values()) for (const t of list) t.destroy(false);
      frames.clear();
      void stepCount;
    },
  };
}
