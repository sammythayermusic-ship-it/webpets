// Manifest schema validation + fetch. Pure (no Pixi) so it is testable in node.

import type { AmbientSpec, FrameSource, LayerName, LightTints, LiveSpec, Manifest, ManifestHabitat, ManifestLayer, ManifestSprite, ManifestSpriteState } from './types';
import type { Rect } from '../sim/types';

export const MANIFEST_URL = '/manifest.json';

const LAYER_NAMES: ReadonlySet<string> = new Set<LayerName>([
  'shadow',
  'bg',
  'memorial',
  'medium',
  'decor_back',
  'pantry',
  'pantry_fill',
  'pet',
  'food',
  'decor_front',
  'glass',
  'fx',
  'night',
]);

export class ManifestError extends Error {
  constructor(path: string, message: string) {
    super(`manifest.json: ${path}: ${message}`);
    this.name = 'ManifestError';
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ManifestError(path, 'expected a finite number');
  return v;
}

function int(v: unknown, path: string): number {
  const n = num(v, path);
  if (!Number.isInteger(n)) throw new ManifestError(path, 'expected an integer');
  return n;
}

function positive(v: unknown, path: string): number {
  const n = num(v, path);
  if (n <= 0) throw new ManifestError(path, 'must be > 0');
  return n;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new ManifestError(path, 'expected a non-empty string');
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new ManifestError(path, 'expected a boolean');
  return v;
}

function rect(v: unknown, path: string): Rect {
  if (!isRecord(v)) throw new ManifestError(path, 'expected a rect object');
  return {
    x: int(v['x'], `${path}.x`),
    y: int(v['y'], `${path}.y`),
    w: int(v['w'], `${path}.w`),
    h: int(v['h'], `${path}.h`),
  };
}

function pair(v: unknown, path: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) throw new ManifestError(path, 'expected [number, number]');
  return [int(v[0], `${path}[0]`), int(v[1], `${path}[1]`)];
}

/** Like {@link pair} but fractional: registration offsets are measured from art, not authored on a grid. */
function numPair(v: unknown, path: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) throw new ManifestError(path, 'expected [number, number]');
  return [num(v[0], `${path}[0]`), num(v[1], `${path}[1]`)];
}

function assetPath(v: unknown, path: string): string {
  const s = str(v, path);
  if (s.startsWith('/') || s.includes('..')) throw new ManifestError(path, 'must be relative to the assets root');
  if (/@\d+x\./.test(s)) throw new ManifestError(path, '@Nx suffixes are forbidden (Pixi would halve the size)');
  return s;
}

/**
 * A state's frames. A bare string is the Phase 0 shorthand for a one-row strip, kept so the pixel-art
 * manifest parses unchanged while states are migrated to rendered sequences one at a time.
 *
 * `files.length` is checked against `frames` here rather than at load time. That is the argument for
 * listing every path instead of a `{dir, prefix, pad}` template: a template can only be validated by
 * touching the filesystem, and a sequence that is quietly one frame short is exactly the kind of bug
 * that shows up as a stutter nobody can place.
 */
function frameSource(v: unknown, frames: number, path: string): FrameSource {
  if (typeof v === 'string') return { kind: 'strip', file: assetPath(v, path) };
  if (!isRecord(v)) throw new ManifestError(path, 'expected a file string or a source object');
  const kind = v['kind'];
  if (kind === 'strip') return { kind: 'strip', file: assetPath(v['file'], `${path}.file`) };
  if (kind === 'sequence') {
    if (!Array.isArray(v['files'])) throw new ManifestError(`${path}.files`, 'expected an array');
    if (v['files'].length !== frames) {
      throw new ManifestError(`${path}.files`, `expected ${frames} files to match "frames", got ${v['files'].length}`);
    }
    return { kind: 'sequence', files: v['files'].map((f, i) => assetPath(f, `${path}.files[${i}]`)) };
  }
  throw new ManifestError(`${path}.kind`, 'expected "strip" | "sequence"');
}

/** Every asset path a state needs: one for a strip, one per frame for a sequence. */
export function stateFiles(state: ManifestSpriteState): readonly string[] {
  return state.source.kind === 'strip' ? [state.source.file] : state.source.files;
}

function layer(v: unknown, path: string): ManifestLayer {
  if (!isRecord(v)) throw new ManifestError(path, 'expected a layer object');
  const name = str(v['name'], `${path}.name`);
  if (!LAYER_NAMES.has(name)) throw new ManifestError(`${path}.name`, `unknown layer "${name}"`);
  const out: ManifestLayer = { name: name as LayerName, z: num(v['z'], `${path}.z`) };
  if (v['file'] !== undefined) out.file = assetPath(v['file'], `${path}.file`);
  // The light variants (Step 3 reads all three; until then dawn and dusk were dropped right here,
  // which is one of the two reasons the bowl's dawn and dusk plates were never on screen).
  for (const k of ['night', 'dawn', 'dusk'] as const) {
    if (v[k] === undefined) continue;
    if (out.file === undefined) throw new ManifestError(`${path}.${k}`, `a ${k} variant needs a day file`);
    out[k] = assetPath(v[k], `${path}.${k}`);
  }
  if (v['blend'] !== undefined) {
    const b = v['blend'];
    if (b !== 'normal' && b !== 'multiply') throw new ManifestError(`${path}.blend`, 'expected "normal" | "multiply"');
    out.blend = b;
  }
  return out;
}

function habitat(v: unknown, path: string): ManifestHabitat {
  if (!isRecord(v)) throw new ManifestError(path, 'expected a habitat object');
  const grid = pair(v['grid'], `${path}.grid`);
  if (!Array.isArray(v['layers'])) throw new ManifestError(`${path}.layers`, 'expected an array');
  const layers = v['layers'].map((l, i) => layer(l, `${path}.layers[${i}]`));
  const ws = v['waterShape'];
  if (!isRecord(ws)) throw new ManifestError(`${path}.waterShape`, 'expected an object');
  return {
    grid,
    layers,
    water: rect(v['water'], `${path}.water`),
    waterShape: {
      cx: num(ws['cx'], `${path}.waterShape.cx`),
      cy: num(ws['cy'], `${path}.waterShape.cy`),
      rx: num(ws['rx'], `${path}.waterShape.rx`),
      ry: num(ws['ry'], `${path}.waterShape.ry`),
      surfaceY: int(ws['surfaceY'], `${path}.waterShape.surfaceY`),
      floorY: int(ws['floorY'], `${path}.waterShape.floorY`),
    },
    ...(v['pantryRect'] === undefined ? {} : { pantryRect: rect(v['pantryRect'], `${path}.pantryRect`) }),
    petAnchor: pair(v['petAnchor'], `${path}.petAnchor`),
    opaqueRect: rect(v['opaqueRect'], `${path}.opaqueRect`),
    ...(v['live'] === undefined ? {} : { live: liveKind(v['live'], `${path}.live`) }),
    ...(v['ambient'] === undefined ? {} : { ambient: ambientSpec(v['ambient'], `${path}.ambient`) }),
  };
}

/** A rect measured off a model: fractional grid px. */
function numRect(v: unknown, path: string): Rect {
  if (!isRecord(v)) throw new ManifestError(path, 'expected a rect object');
  return { x: num(v['x'], `${path}.x`), y: num(v['y'], `${path}.y`), w: num(v['w'], `${path}.w`), h: num(v['h'], `${path}.h`) };
}

function rgb(v: unknown, path: string): [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3) throw new ManifestError(path, 'expected [r, g, b]');
  return [num(v[0], `${path}[0]`), num(v[1], `${path}[1]`), num(v[2], `${path}[2]`)];
}

function lightTints(v: unknown, path: string): LightTints {
  if (!isRecord(v)) throw new ManifestError(path, 'expected { dawn, dusk, night }');
  return { dawn: rgb(v['dawn'], `${path}.dawn`), dusk: rgb(v['dusk'], `${path}.dusk`), night: rgb(v['night'], `${path}.night`) };
}

function files(v: unknown, path: string): string[] {
  if (!Array.isArray(v) || v.length === 0) throw new ManifestError(path, 'expected a non-empty array of files');
  return v.map((f, i) => assetPath(f, `${path}[${i}]`));
}

function ambientSpec(v: unknown, path: string): AmbientSpec {
  if (!isRecord(v)) throw new ManifestError(path, 'expected an ambient object');
  const out: AmbientSpec = { tints: lightTints(v['tints'], `${path}.tints`) };
  const w = v['wheel'];
  if (w !== undefined) {
    if (!isRecord(w)) throw new ManifestError(`${path}.wheel`, 'expected an object');
    out.wheel = {
      rect: rect(w['rect'], `${path}.wheel.rect`),
      loopDeg: positive(w['loopDeg'], `${path}.wheel.loopDeg`),
      frames: files(w['frames'], `${path}.wheel.frames`),
      hub: numPair(w['hub'], `${path}.wheel.hub`),
      tints: lightTints(w['tints'], `${path}.wheel.tints`),
    };
  }
  const b = v['bottle'];
  if (b !== undefined) {
    if (!isRecord(b)) throw new ManifestError(`${path}.bottle`, 'expected an object');
    out.bottle = { spout: numPair(b['spout'], `${path}.bottle.spout`), water: numRect(b['water'], `${path}.bottle.water`), dropTo: num(b['dropTo'], `${path}.bottle.dropTo`) };
  }
  if (v['door'] !== undefined) out.door = numRect(v['door'], `${path}.door`);
  if (v['air'] !== undefined) out.air = numRect(v['air'], `${path}.air`);
  const h = v['hood'];
  if (h !== undefined) {
    if (!Array.isArray(h) || h.length !== 2) throw new ManifestError(`${path}.hood`, 'expected two points');
    out.hood = [numPair(h[0], `${path}.hood[0]`), numPair(h[1], `${path}.hood[1]`)];
  }
  const c = v['critter'];
  if (c !== undefined) {
    if (!isRecord(c)) throw new ManifestError(`${path}.critter`, 'expected an object');
    const kind = c['kind'];
    if (kind !== 'snail' && kind !== 'moth') throw new ManifestError(`${path}.critter.kind`, 'expected "snail" | "moth"');
    const p = c['path'];
    out.critter = {
      kind,
      frames: files(c['frames'], `${path}.critter.frames`),
      size: numPair(c['size'], `${path}.critter.size`),
      fps: positive(c['fps'], `${path}.critter.fps`),
      ...(p === undefined
        ? {}
        : (() => {
            const r = isRecord(p) ? p : {};
            return { path: { cx: num(r['cx'], `${path}.critter.path.cx`), cy: num(r['cy'], `${path}.critter.path.cy`), rx: num(r['rx'], `${path}.critter.path.rx`), ry: num(r['ry'], `${path}.critter.path.ry`) } };
          })()),
    };
  }
  return out;
}

function liveKind(v: unknown, path: string): LiveSpec {
  if (!isRecord(v)) throw new ManifestError(path, 'expected a live layer object');
  if (v['kind'] !== 'fish-bowl') throw new ManifestError(`${path}.kind`, 'expected "fish-bowl"');
  return {
    kind: 'fish-bowl',
    ...(v['contents'] === undefined ? {} : { contents: assetPath(v['contents'], `${path}.contents`) }),
    ...(v['plants'] === undefined ? {} : { plants: assetPath(v['plants'], `${path}.plants`) }),
  };
}

function spriteState(v: unknown, path: string): ManifestSpriteState {
  if (!isRecord(v)) throw new ManifestError(path, 'expected a sprite state object');
  const frames = int(v['frames'], `${path}.frames`);
  if (frames < 1) throw new ManifestError(`${path}.frames`, 'must be >= 1');
  if (!Array.isArray(v['sequence']) || v['sequence'].length === 0) {
    throw new ManifestError(`${path}.sequence`, 'expected a non-empty array');
  }
  const sequence = v['sequence'].map((f, i) => {
    const n = int(f, `${path}.sequence[${i}]`);
    if (n < 0 || n >= frames) throw new ManifestError(`${path}.sequence[${i}]`, `frame ${n} out of range 0..${frames - 1}`);
    return n;
  });
  const out: ManifestSpriteState = {
    source: frameSource(v['source'] ?? v['file'], frames, `${path}.${v['source'] === undefined ? 'file' : 'source'}`),
    frames,
    sequence,
    loop: bool(v['loop'], `${path}.loop`),
  };
  if (v['anchor'] !== undefined) out.anchor = numPair(v['anchor'], `${path}.anchor`);
  if (v['stridePx'] !== undefined) out.stridePx = positive(v['stridePx'], `${path}.stridePx`);
  if (v['returnTo'] !== undefined) out.returnTo = str(v['returnTo'], `${path}.returnTo`);
  if (v['offsets'] !== undefined) {
    if (!Array.isArray(v['offsets']) || v['offsets'].length !== frames) {
      throw new ManifestError(`${path}.offsets`, `expected ${frames} [dx, dy] pairs`);
    }
    out.offsets = v['offsets'].map((o, i) => pair(o, `${path}.offsets[${i}]`));
  }
  return out;
}

function sprite(v: unknown, path: string): ManifestSprite {
  if (!isRecord(v)) throw new ManifestError(path, 'expected a sprite object');
  const body = v['body'];
  if (!isRecord(body)) throw new ManifestError(`${path}.body`, 'expected { w, h }');
  const statesIn = v['states'];
  if (!isRecord(statesIn)) throw new ManifestError(`${path}.states`, 'expected an object');
  const states: Record<string, ManifestSpriteState> = {};
  for (const [name, def] of Object.entries(statesIn)) states[name] = spriteState(def, `${path}.states.${name}`);
  for (const [name, def] of Object.entries(states)) {
    if (def.returnTo !== undefined && states[def.returnTo] === undefined) {
      throw new ManifestError(`${path}.states.${name}.returnTo`, `unknown state "${def.returnTo}"`);
    }
  }
  return {
    frame: pair(v['frame'], `${path}.frame`),
    ...(v['fps'] === undefined ? {} : { fps: positive(v['fps'], `${path}.fps`) }),
    body: { w: int(body['w'], `${path}.body.w`), h: int(body['h'], `${path}.body.h`) },
    ...(v['drawScale'] === undefined ? {} : { drawScale: positive(v['drawScale'], `${path}.drawScale`) }),
    states,
  };
}

/** Validates an untrusted JSON value into a Manifest; throws ManifestError naming the offending path. */
export function parseManifest(json: unknown): Manifest {
  if (!isRecord(json)) throw new ManifestError('$', 'expected an object');
  if (json['version'] !== 1) throw new ManifestError('version', 'expected 1');
  if (!isRecord(json['habitats'])) throw new ManifestError('habitats', 'expected an object');
  if (!isRecord(json['sprites'])) throw new ManifestError('sprites', 'expected an object');
  const habitats: Record<string, ManifestHabitat> = {};
  for (const [key, def] of Object.entries(json['habitats'])) habitats[key] = habitat(def, `habitats["${key}"]`);
  const sprites: Record<string, ManifestSprite> = {};
  for (const [key, def] of Object.entries(json['sprites'])) sprites[key] = sprite(def, `sprites["${key}"]`);
  return { version: 1, habitats, sprites };
}

/** Fetches `/manifest.json` (Vite publicDir = assets/) and validates it. */
export async function loadManifest(url: string = MANIFEST_URL): Promise<Manifest> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`manifest.json: HTTP ${res.status} loading ${url}`);
  const json: unknown = await res.json();
  return parseManifest(json);
}
