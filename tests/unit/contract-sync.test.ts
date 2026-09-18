// The TypeScript half of the grid/window contract guard.
//
// `src-tauri/src/window.rs` already pins the Rust constants and the tauri.conf.json fallback to
// `src/sim/constants.ts` via include_str!. That test only runs under `cargo test`, but the drift it
// catches is almost always introduced from the TypeScript side, where `npm test` is the loop people
// actually run. This mirrors the same assertions in Vitest so a TS-only change fails immediately
// instead of at the next Rust build.
//
// Both halves read the same three files, so they cannot disagree about the truth; they only differ
// in which command surfaces the failure.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCALE,
  GRID_H,
  GRID_W,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_L,
  SCALE_M,
  SCALE_S,
  SCALE_STEPS_PER_UNIT,
  WINDOW_PAD,
  windowSizeForScale,
} from '../../src/sim/constants';

const ROOT = resolve(__dirname, '../..');
const RS_PATH = 'src-tauri/src/window.rs';
const CONF_PATH = 'src-tauri/tauri.conf.json';

const rust = readFileSync(resolve(ROOT, RS_PATH), 'utf8');
const conf = JSON.parse(readFileSync(resolve(ROOT, CONF_PATH), 'utf8')) as {
  app: { windows: Array<{ label: string; width: number; height: number }> };
};

/** window.rs with `//` and block comments stripped, so a commented-out stale declaration cannot
 * shadow the live one. */
const RUST_SOURCE = rust.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/**
 * A `const <name>: f64 = <number>;` (or u8) from window.rs. The initialiser may also be another
 * constant's name (`const MIN_SCALE: u8 = SCALE_S;`), which is followed one link at a time. Throws
 * when the pattern stops matching rather than returning a default, because a guard that silently
 * skips its own assertions is worse than no guard at all.
 */
function rustConst(name: string, seen: readonly string[] = []): number {
  if (seen.includes(name)) {
    throw new Error(`${RS_PATH}: constant ${name} is defined in terms of itself (${[...seen, name].join(' -> ')}).`);
  }
  const m = new RegExp(`const\\s+${name}\\s*:\\s*[a-z0-9]+\\s*=\\s*([^;]+);`).exec(RUST_SOURCE);
  const raw = m?.[1]?.trim();
  if (raw === undefined) {
    throw new Error(
      `${RS_PATH}: could not find a \`const ${name}: <type> = <value>;\` declaration. This test ` +
        `parses that exact shape to keep it in sync with src/sim/constants.ts; if it was renamed or ` +
        `reformatted, update rustConst() in tests/unit/contract-sync.test.ts to match.`,
    );
  }
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(raw)) return Number(raw);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return rustConst(raw, [...seen, name]);
  throw new Error(
    `${RS_PATH}: \`${name}\` is \`${raw}\`, which is neither a number literal nor another constant's ` +
      `name. This test mirrors it into TypeScript, so it has to stay one of those two.`,
  );
}

describe('grid contract: TypeScript vs Rust vs tauri.conf.json', () => {
  it('mirrors GRID_W, GRID_H and WINDOW_PAD in window.rs', () => {
    // TS sizes the Pixi canvas and the click-through hit regions from its copy; Rust sizes the
    // window from its own. If they drift, the habitat lands off-centre inside the padding and the
    // hit regions stop matching the visible art.
    expect(rustConst('GRID_W'), `GRID_W must match ${RS_PATH}`).toBe(GRID_W);
    expect(rustConst('GRID_H'), `GRID_H must match ${RS_PATH}`).toBe(GRID_H);
    expect(rustConst('WINDOW_PAD'), `WINDOW_PAD must match ${RS_PATH}`).toBe(WINDOW_PAD);
  });

  it('mirrors the named S/M/L rungs in window.rs', () => {
    // tray.rs ticks and enables the Size submenu by comparing the current scale against these.
    expect(rustConst('SCALE_S'), `SCALE_S must match ${RS_PATH}`).toBe(SCALE_S);
    expect(rustConst('SCALE_M'), `SCALE_M must match ${RS_PATH}`).toBe(SCALE_M);
    expect(rustConst('SCALE_L'), `SCALE_L must match ${RS_PATH}`).toBe(SCALE_L);
  });

  it('mirrors the scale range and the step count', () => {
    expect(rustConst('MIN_SCALE'), `MIN_SCALE must match ${RS_PATH}`).toBe(MIN_SCALE);
    expect(rustConst('MAX_SCALE'), `MAX_SCALE must match ${RS_PATH}`).toBe(MAX_SCALE);
    expect(rustConst('SCALE_STEPS_PER_UNIT'), `SCALE_STEPS_PER_UNIT must match ${RS_PATH}`).toBe(
      SCALE_STEPS_PER_UNIT,
    );
  });

  it('keeps the grid divisible by the step count, in both languages', () => {
    // This is what turns "Rust and TypeScript agree to the pixel" from a hope into a theorem. With the
    // grid divisible by the step count, `window_size_for_scale` is whole-number arithmetic on both
    // sides and there is no rounding rule that could drift. It replaces the old contiguous-run check,
    // which existed only because Rust expressed a three-rung ladder as a range.
    for (const [name, grid] of [
      ['GRID_W', GRID_W],
      ['GRID_H', GRID_H],
    ] as const) {
      expect(grid % SCALE_STEPS_PER_UNIT, `${name} must divide by SCALE_STEPS_PER_UNIT`).toBe(0);
      expect(rustConst(name) % rustConst('SCALE_STEPS_PER_UNIT'), `${name} in ${RS_PATH}`).toBe(0);
    }
  });

  it('sizes the pre-boot window to the default scale', () => {
    const main = conf.app.windows.find((w) => w.label === 'main');
    expect(main, `${CONF_PATH} must declare a window labelled "main"`).toBeDefined();
    // The config size is what the user sees for the instant before the frontend calls set_scale.
    // Anything but DEFAULT_SCALE's size shows as a visible resize jump on every launch.
    expect(DEFAULT_SCALE, 'DEFAULT_SCALE must be inside the legal range').toBeGreaterThanOrEqual(MIN_SCALE);
    expect(DEFAULT_SCALE).toBeLessThanOrEqual(MAX_SCALE);
    const expected = windowSizeForScale(DEFAULT_SCALE);
    expect(
      { width: main?.width, height: main?.height },
      `${CONF_PATH} creates "main" at ${main?.width}x${main?.height}, but DEFAULT_SCALE ` +
        `${DEFAULT_SCALE} in src/sim/constants.ts is ${expected.width}x${expected.height}.`,
    ).toEqual(expected);
  });
});
