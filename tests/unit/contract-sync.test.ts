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
import { GRID_H, GRID_W, SCALES, WINDOW_PAD, windowSizeForScale } from '../../src/sim/constants';

const ROOT = resolve(__dirname, '../..');
const RS_PATH = 'src-tauri/src/window.rs';
const CONF_PATH = 'src-tauri/tauri.conf.json';

const rust = readFileSync(resolve(ROOT, RS_PATH), 'utf8');
const conf = JSON.parse(readFileSync(resolve(ROOT, CONF_PATH), 'utf8')) as {
  app: { windows: Array<{ label: string; width: number; height: number }> };
};

/**
 * A `const <name>: f64 = <number>;` (or u8) from window.rs, with `//` and block comments stripped
 * first so a commented-out stale declaration cannot shadow the live one. Throws when the pattern
 * stops matching rather than returning a default, because a guard that silently skips its own
 * assertions is worse than no guard at all.
 */
function rustConst(name: string): number {
  const source = rust.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const m = new RegExp(`const\\s+${name}\\s*:\\s*[a-z0-9]+\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)\\s*;`).exec(source);
  if (!m?.[1]) {
    throw new Error(
      `${RS_PATH}: could not find a \`const ${name}: <type> = <number>;\` declaration. This test ` +
        `parses that exact shape to keep it in sync with src/sim/constants.ts; if it was renamed or ` +
        `reformatted, update rustConst() in tests/unit/contract-sync.test.ts to match.`,
    );
  }
  return Number(m[1]);
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

  it('accepts exactly the scales in SCALES', () => {
    const min = rustConst('MIN_SCALE');
    const max = rustConst('MAX_SCALE');
    const scales = [...SCALES];
    expect(min, `MIN_SCALE in ${RS_PATH} must be the smallest entry of SCALES`).toBe(Math.min(...scales));
    expect(max, `MAX_SCALE in ${RS_PATH} must be the largest entry of SCALES`).toBe(Math.max(...scales));
    // Rust expresses the ladder as a contiguous range, which can only represent a contiguous list.
    const contiguous = scales.every((s, i) => i === 0 || s === (scales[i - 1] as number) + 1);
    expect(contiguous, `SCALES ${JSON.stringify(scales)} must be contiguous and ascending, or ${RS_PATH} needs an explicit list instead of a range`).toBe(true);
  });

  it('sizes the pre-boot window to the default scale', () => {
    const main = conf.app.windows.find((w) => w.label === 'main');
    expect(main, `${CONF_PATH} must declare a window labelled "main"`).toBeDefined();
    // The config size is what the user sees for the instant before the frontend calls set_scale.
    // Anything other than a real ladder entry shows as a visible resize jump on every launch.
    const sizes = SCALES.map((s) => windowSizeForScale(s));
    const match = sizes.find((s) => s.width === main?.width && s.height === main?.height);
    expect(
      match,
      `${CONF_PATH} creates "main" at ${main?.width}x${main?.height}, which is not any of the ladder ` +
        `sizes ${JSON.stringify(sizes)} derived from src/sim/constants.ts.`,
    ).toBeDefined();
  });
});
