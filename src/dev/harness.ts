// Verification-only remote control for the packaged app (docs/HARNESS.md). Loaded by main.ts only when
// the build was made with VITE_WEBPETS_HARNESS=1, via a dynamic import exactly like the diag bridge, so
// a normal build tree-shakes it out; its two Rust commands exist only under `--features harness`.
//
// A driver drops `inbox/<id>.json` under `<app_data_dir>/harness/`; `installHarness` polls, runs the
// command through `runCommand`, and writes `out/<id>.result.json`. `runCommand` is pure in the sense
// that matters: every effect goes through `ctx` (the app) or `io` (files, clock, sleep), so the unit
// tests drive it with fakes and never touch Tauri.

import type { AppStore, ForcedState } from '../app/types';
import type { Stimulus } from '../sim/needs';
import type { WindowApi } from '../platform/types';
import type { HabitatScene } from '../render/types';
import type { Habitat, Species } from '../sim/types';
import type { DevPanelHandle, HudHandle } from '../ui/types';

/** How often the inbox is polled. Fast enough that a script's step-to-step latency is invisible at 60 fps. */
const POLL_MS = 250;
/** `record` asks the recorder for a chunk this often so a crash mid-recording still leaves most of the clip. */
const RECORD_TIMESLICE_MS = 1000;
/** First supported wins; WKWebView's actual answer can only be learned by asking it. */
const RECORD_MIME_PREFERENCE = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

const FORCED_STATES: ReadonlySet<string> = new Set<ForcedState>(['fed', 'hungry', 'starving', 'dead', 'asleep']);
const SPECIES: ReadonlySet<string> = new Set<Species>(['fish', 'hamster', 'frog', 'chicken']);
const HABITATS: ReadonlySet<string> = new Set<Habitat>([
  'bowl',
  'tank',
  'cage',
  'terrarium',
  'pond',
  'jar',
  'brooder',
  'coop',
]);

/** What the harness needs from the app. Narrow on purpose so the tests can hand in small fakes. */
export interface HarnessContext {
  store: Pick<AppStore, 'getState'>;
  platform: { window: Pick<WindowApi, 'getGeometry'> };
  scene: Pick<HabitatScene, 'snapshot' | 'debugState' | 'fps' | 'setPointer' | 'tap'>;
  devPanel: DevPanelHandle & Partial<{ open(): void; close(): void }>;
  hud?: Pick<HudHandle, 'setVisible'>;
}

/** Everything outside the app that a command touches: output files, the clock, and waiting. */
export interface HarnessIo {
  /** Writes `out/<name>`; resolves to the absolute path. */
  write(name: string, bytes: Uint8Array): Promise<string>;
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Delivers a finished result (`script` emits one per step). The poller writes `out/<id>.result.json`. */
  emit(result: HarnessResult): Promise<void>;
}

/** A command as parsed from its inbox file: `op` plus whatever arguments that op reads. */
export interface HarnessCommand {
  id?: string;
  op: string;
  [arg: string]: unknown;
}

export interface HarnessResult {
  id: string;
  op: string;
  ok: boolean;
  error?: string;
  data?: unknown;
  /** ISO timestamp of completion. */
  at: string;
}

/** A command whose result is written when it finishes rather than before the next command runs. */
export function isDetached(cmd: HarnessCommand): boolean {
  return cmd.op === 'record';
}

// ---- argument readers: every op validates its own inputs so a typo fails with a named field ----

function num(cmd: HarnessCommand, key: string): number {
  const v = cmd[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${cmd.op}: "${key}" must be a finite number`);
  return v;
}

function optNum(cmd: HarnessCommand, key: string): number | undefined {
  return cmd[key] === undefined ? undefined : num(cmd, key);
}

function str(cmd: HarnessCommand, key: string): string {
  const v = cmd[key];
  if (typeof v !== 'string' || v.length === 0) throw new Error(`${cmd.op}: "${key}" must be a non-empty string`);
  return v;
}

function bool(cmd: HarnessCommand, key: string): boolean {
  const v = cmd[key];
  if (typeof v !== 'boolean') throw new Error(`${cmd.op}: "${key}" must be true or false`);
  return v;
}

function nullableNum(cmd: HarnessCommand, key: string): number | null {
  const v = cmd[key];
  if (v === null || v === undefined) return null;
  return num(cmd, key);
}

function isCommand(v: unknown): v is HarnessCommand {
  return typeof v === 'object' && v !== null && typeof (v as { op?: unknown }).op === 'string';
}

function errorText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

function commandId(cmd: HarnessCommand, io: HarnessIo): string {
  return typeof cmd.id === 'string' && cmd.id.length > 0 ? cmd.id : `${io.now()}-${cmd.op}`;
}

/** `data:image/png;base64,...` → bytes. `scene.snapshot()` hands back a data URL; files want bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) throw new Error('snapshot did not return a data URL');
  const header = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  if (!header.endsWith(';base64')) throw new Error(`snapshot data URL is not base64 (${header})`);
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function documentState(): { visibility: string; hasFocus: boolean } {
  if (typeof document === 'undefined') return { visibility: 'no-document', hasFocus: false };
  return { visibility: document.visibilityState, hasFocus: document.hasFocus() };
}

// ---- ops ----

async function opState(ctx: HarnessContext): Promise<unknown> {
  const s = ctx.store.getState();
  let geometry: unknown;
  try {
    geometry = await ctx.platform.window.getGeometry();
  } catch (e) {
    geometry = `unavailable: ${errorText(e)}`;
  }
  return {
    ...documentState(),
    fps: ctx.scene.fps(),
    scene: ctx.scene.debugState(),
    hunger: s.hunger,
    night: s.night,
    hidden: s.hidden,
    balance: s.balance,
    pet: s.pet,
    settings: s.settings,
    geometry,
    needs: s.needs,
    present: s.present,
    drives: s.actions.drives(false),
  };
}

const STIMULI: ReadonlySet<string> = new Set(['pointer', 'tap', 'feed', 'bite']);

function stimulus(cmd: HarnessCommand): Stimulus {
  const v = str(cmd, 'kind');
  if (!STIMULI.has(v)) throw new Error(`${cmd.op}: "kind" must be one of ${[...STIMULI].join(', ')}`);
  return v as Stimulus;
}

async function opStats(cmd: HarnessCommand, ctx: HarnessContext, io: HarnessIo): Promise<unknown> {
  const seconds = num(cmd, 'seconds');
  if (seconds <= 0) throw new Error('stats: "seconds" must be > 0');
  const before = ctx.scene.debugState();
  const t0 = io.now();
  await io.sleep(seconds * 1000);
  const after = ctx.scene.debugState();
  const elapsed = Math.max(1, io.now() - t0);
  return {
    advancesPerSec: Math.round(((after.advances - before.advances) / elapsed) * 1000),
    stepsPerSec: Math.round(((after.steps - before.steps) / elapsed) * 1000 * 10) / 10,
    fps: Math.round(ctx.scene.fps()),
    visibility: documentState().visibility,
    renderMs: after.renderMs,
    elapsedMs: elapsed,
  };
}

async function opSnapshot(cmd: HarnessCommand, ctx: HarnessContext, io: HarnessIo): Promise<unknown> {
  const name = str(cmd, 'name');
  const bytes = dataUrlToBytes(await ctx.scene.snapshot());
  const file = await io.write(`${name}.png`, bytes);
  return { file, bytes: bytes.length };
}

function pickRecordMime(): string | null {
  for (const mime of RECORD_MIME_PREFERENCE) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

/**
 * Records the Pixi canvas for `seconds` and writes `<name>.mp4|webm`.
 *
 * This is the one op that takes real time while the app must keep answering: the poller and the
 * script runner do not await it (see `isDetached`), which is how a script feeds the pet in the
 * middle of a clip. Its result is written when the file is.
 */
async function opRecord(cmd: HarnessCommand, io: HarnessIo): Promise<unknown> {
  const name = str(cmd, 'name');
  const seconds = num(cmd, 'seconds');
  if (seconds <= 0) throw new Error('record: "seconds" must be > 0');
  const fps = optNum(cmd, 'fps') ?? 60;
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('record: MediaRecorder is not available in this webview; use snapshot instead');
  }
  const canvas = typeof document === 'undefined' ? null : document.querySelector('canvas');
  if (!canvas) throw new Error('record: no <canvas> in the document');
  if (typeof canvas.captureStream !== 'function') throw new Error('record: canvas.captureStream is not available');
  const preferred = pickRecordMime();
  const stream = canvas.captureStream(fps);
  const recorder = preferred === null ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType: preferred });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (e: Event) => reject(new Error(`record: MediaRecorder error (${e.type})`));
  });
  try {
    recorder.start(RECORD_TIMESLICE_MS);
    await io.sleep(seconds * 1000);
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
  const mime = recorder.mimeType || preferred || 'video/webm';
  const blob = new Blob(chunks, { type: mime });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length === 0) throw new Error(`record: the recorder produced no data (mime ${mime})`);
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const file = await io.write(`${name}.${ext}`, bytes);
  return { file, mime, bytes: bytes.length, seconds, fps };
}

async function opScript(cmd: HarnessCommand, ctx: HarnessContext, io: HarnessIo): Promise<unknown> {
  const steps = cmd['steps'];
  if (!Array.isArray(steps)) throw new Error('script: "steps" must be an array of commands');
  const parentId = commandId(cmd, io);
  const results: HarnessResult[] = [];
  let failed = 0;
  for (let i = 0; i < steps.length; i++) {
    const raw: unknown = steps[i];
    const step: HarnessCommand = isCommand(raw) ? raw : { op: typeof raw === 'string' ? raw : String(raw) };
    if (step.id === undefined) step.id = `${parentId}.${i}-${step.op}`;
    const pending = runCommand(step, ctx, io);
    if (isDetached(step)) {
      // Keep the script moving; the step's result lands whenever the recording does.
      void pending.then((r) => io.emit(r)).catch((e: unknown) => console.warn('[harness] detached step failed', e));
      results.push({ id: step.id, op: step.op, ok: true, data: { detached: true }, at: new Date(io.now()).toISOString() });
      continue;
    }
    const result = await pending;
    await io.emit(result);
    results.push(result);
    if (!result.ok) failed++;
  }
  if (failed > 0) throw new Error(`script: ${failed} of ${steps.length} steps failed; see the per-step results`);
  return { steps: results.map((r) => ({ id: r.id, op: r.op, ok: r.ok })) };
}

async function dispatch(cmd: HarnessCommand, ctx: HarnessContext, io: HarnessIo): Promise<unknown> {
  const { actions } = ctx.store.getState();
  switch (cmd.op) {
    case 'state':
      return opState(ctx);
    case 'feed':
      return actions.feed();
    case 'skip':
      actions.dev.skip(num(cmd, 'ms'));
      return { hunger: ctx.store.getState().hunger };
    case 'setHunger':
      actions.dev.setHunger(num(cmd, 'n'));
      return { hunger: ctx.store.getState().hunger };
    case 'setPantry':
      actions.dev.setPantry(num(cmd, 'n'));
      return { pantry: ctx.store.getState().pet.pantry };
    case 'setBalance':
      actions.dev.setBalance(num(cmd, 'n'));
      return { balance: ctx.store.getState().balance };
    case 'force': {
      const state = str(cmd, 'state');
      if (!FORCED_STATES.has(state)) throw new Error(`force: unknown state "${state}" (fed|hungry|starving|dead|asleep)`);
      actions.dev.forceState(state as ForcedState);
      return { hunger: ctx.store.getState().hunger, alive: ctx.store.getState().pet.alive };
    }
    case 'night': {
      const value = cmd['value'];
      if (value !== true && value !== false && value !== null) throw new Error('night: "value" must be true, false or null');
      actions.dev.setNightOverride(value);
      return { night: ctx.store.getState().night };
    }
    case 'scale':
      await actions.setScale(num(cmd, 'steps'));
      return { scale: ctx.store.getState().settings.scale };
    case 'species': {
      const species = str(cmd, 'species');
      const habitat = str(cmd, 'habitat');
      if (!SPECIES.has(species)) throw new Error(`species: unknown species "${species}"`);
      if (!HABITATS.has(habitat)) throw new Error(`species: unknown habitat "${habitat}"`);
      // Deferred past this result's write: the switch reloads the page (main.ts subscribes to the
      // species change), and a reload in the middle of the IPC that writes the result loses it.
      setTimeout(() => {
        void actions.dev.setSpecies(species as Species, habitat as Habitat).catch((e: unknown) => {
          console.warn('[harness] setSpecies failed', e);
        });
      }, 100);
      return { scheduled: true, reloads: true };
    }
    case 'hide':
      await actions.setHidden(true);
      return { hidden: ctx.store.getState().hidden };
    case 'show':
      await actions.setHidden(false);
      return { hidden: ctx.store.getState().hidden };
    case 'devPanel': {
      const open = bool(cmd, 'open');
      if (open !== ctx.devPanel.isOpen()) {
        if (open && ctx.devPanel.open) ctx.devPanel.open();
        else if (!open && ctx.devPanel.close) ctx.devPanel.close();
        else ctx.devPanel.toggle();
      }
      return { open: ctx.devPanel.isOpen(), rect: ctx.devPanel.getRect() };
    }
    case 'resetClock':
      actions.dev.resetClock();
      return { devClockOffsetMs: ctx.store.getState().settings.devClockOffsetMs };
    case 'newPet': {
      // Adopt a fresh pet (a fish in the bowl), burying the current one if it died: a script that
      // records behaviour needs a living pet, and `force` cannot bring a dead one back.
      actions.newPet();
      const pet = ctx.store.getState().pet;
      return { id: pet.id, name: pet.name, species: pet.species, habitat: pet.habitat, personality: pet.personality };
    }
    case 'pointer': {
      const x = nullableNum(cmd, 'x');
      const y = x === null ? null : num(cmd, 'y');
      ctx.scene.setPointer(x, y);
      return { x, y };
    }
    case 'tap': {
      // What a real click on the glass does (main.ts): the needs stimulus, and the scene's tap,
      // which startles the fish and rings the water. Window-local CSS px, like `pointer`.
      const x = num(cmd, 'x');
      const y = num(cmd, 'y');
      actions.poke('tap');
      ctx.scene.tap(x, y);
      return { x, y };
    }
    case 'poke': {
      const kind = stimulus(cmd);
      actions.poke(kind);
      return { kind, needs: ctx.store.getState().needs };
    }
    case 'setNeeds': {
      const values: Partial<Record<'energy' | 'curiosity' | 'comfort' | 'stress', number>> = {};
      for (const k of ['energy', 'curiosity', 'comfort', 'stress'] as const) {
        const v = optNum(cmd, k);
        if (v !== undefined) values[k] = v;
      }
      actions.dev.setNeeds(values);
      return { needs: ctx.store.getState().needs };
    }
    case 'presence': {
      const present = bool(cmd, 'present');
      actions.setPresence(present);
      return { present, needs: ctx.store.getState().needs };
    }
    case 'snapshot':
      return opSnapshot(cmd, ctx, io);
    case 'stats':
      return opStats(cmd, ctx, io);
    case 'record':
      return opRecord(cmd, io);
    case 'sleep': {
      const ms = num(cmd, 'ms');
      await io.sleep(ms);
      return { slept: ms };
    }
    case 'script':
      return opScript(cmd, ctx, io);
    default:
      throw new Error(`unknown op "${cmd.op}"`);
  }
}

/** Runs one command. Never rejects: a throwing op becomes `ok: false` so the poller outlives it. */
export async function runCommand(cmd: HarnessCommand, ctx: HarnessContext, io: HarnessIo): Promise<HarnessResult> {
  const id = commandId(cmd, io);
  try {
    const data = await dispatch(cmd, ctx, io);
    return { id, op: cmd.op, ok: true, data, at: new Date(io.now()).toISOString() };
  } catch (e) {
    return { id, op: cmd.op, ok: false, error: errorText(e), at: new Date(io.now()).toISOString() };
  }
}

/** Parses one inbox file. A file that is not a command still gets a result, so the driver is never left waiting. */
export function parseCommand(text: string): HarnessCommand {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { op: 'invalid', error: `not JSON: ${errorText(e)}` };
  }
  if (!isCommand(parsed)) {
    const id = idOf(parsed);
    return id === undefined ? { op: 'invalid', error: 'missing "op"' } : { op: 'invalid', error: 'missing "op"', id };
  }
  return parsed;
}

function idOf(v: unknown): string | undefined {
  if (typeof v === 'object' && v !== null) {
    const id = (v as { id?: unknown }).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return undefined;
}

/** Where commands come from: `harness_poll` in the app, a fake in the tests. */
export interface HarnessInbox {
  /** Returns and consumes every queued command text, in inbox order. */
  poll(): Promise<string[]>;
}

/**
 * Runs one batch of inbox texts in order. Each command is isolated: a failing result write (or a
 * malformed file) is logged and the next command still runs, because the inbox already deleted
 * every file in the batch and nothing would ever retry them. `record` is started and left to
 * finish on its own so the next command (a feed, a state change) lands inside the clip.
 */
export async function drainInbox(texts: readonly string[], ctx: HarnessContext, io: HarnessIo): Promise<void> {
  for (const text of texts) {
    try {
      const cmd = parseCommand(text);
      if (cmd.op === 'invalid') {
        await io.emit({
          id: commandId(cmd, io),
          op: 'invalid',
          ok: false,
          error: String(cmd['error']),
          at: new Date(io.now()).toISOString(),
        });
        continue;
      }
      const pending = runCommand(cmd, ctx, io);
      if (isDetached(cmd)) {
        void pending.then((r) => io.emit(r)).catch((e: unknown) => console.warn('[harness] detached command failed', e));
      } else {
        await io.emit(await pending);
      }
    } catch (e) {
      console.warn('[harness] command failed outside runCommand (result not written)', e);
    }
  }
}

/**
 * Polls the inbox every `intervalMs`. One batch at a time: a tick that lands while a batch is still
 * running is skipped, so commands never interleave. A poll that rejects is logged and the next tick
 * tries again. Returns a stop function.
 */
export function startPoller(inbox: HarnessInbox, ctx: HarnessContext, io: HarnessIo, intervalMs = POLL_MS): () => void {
  let busy = false;
  const tick = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const texts = await inbox.poll();
      if (texts.length > 0) await drainInbox(texts, ctx, io);
    } catch (e) {
      console.warn('[harness] poll failed', e);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  return () => clearInterval(timer);
}

/** Wires the poller to the two Rust commands. Only `installHarness` touches Tauri. */
export async function installHarness(ctx: HarnessContext): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const io: HarnessIo = {
    write: (name, bytes) => invoke<string>('harness_write', bytes, { headers: { 'x-harness-name': name } }),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    emit: async (result) => {
      const bytes = new TextEncoder().encode(JSON.stringify(result, null, 2));
      await io.write(`${result.id}.result.json`, bytes);
    },
  };
  startPoller({ poll: () => invoke<string[]>('harness_poll') }, ctx, io);
  console.info('[harness] installed; polling the inbox every', POLL_MS, 'ms');
}
