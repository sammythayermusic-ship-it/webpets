// Choosing what to say: a line for a moment, or a fact in the pet's voice, never one it said lately.
// Pure. The memory is plain data the caller persists, so a restart does not make the pet repeat itself.

import type { Personality, Rng } from '../sim/types';
import type { Fact, Moment, Utterance, Voice } from './types';

/** How many recent lines the pet remembers saying (per pet, across moments). */
export const RECENT_LINES = 80;

export interface SayMemory {
  /** Ids of the most recent lines, newest last. */
  recent: readonly string[];
  /** Ids of facts already told; cleared once every fact has been told. */
  factsTold: readonly string[];
}

export function emptyMemory(): SayMemory {
  return { recent: [], factsTold: [] };
}

/** Values for `{name}` and any later tokens. A line whose token has no value is never chosen. */
export type SayVars = Readonly<Record<string, string | undefined>>;

/** FNV-1a, so a line keeps its id when the file around it is reordered. */
export function lineId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const TOKEN = /\{(\w+)\}/g;

function fill(template: string, vars: SayVars): string | null {
  let missing = false;
  const out = template.replace(TOKEN, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === '') {
      missing = true;
      return '';
    }
    return v;
  });
  return missing ? null : out;
}

function pickIndex(n: number, rng: Rng): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

function remember(mem: SayMemory, id: string): SayMemory {
  const recent = [...mem.recent.filter((r) => r !== id), id];
  return { ...mem, recent: recent.slice(Math.max(0, recent.length - RECENT_LINES)) };
}

/**
 * A line from `pool`, ids prefixed with `key` ("thought:zen", "chat:hello:zen"). Prefers lines not in
 * recent memory; when every line of the pool is recent, takes the one said longest ago. Null when the
 * pool is empty or no line can be filled.
 */
export function sayFromPool(
  pool: readonly string[],
  key: string,
  kind: Utterance['kind'],
  mem: SayMemory,
  rng: Rng,
  vars: SayVars = {},
): { utterance: Utterance; memory: SayMemory } | null {
  const candidates: { id: string; text: string }[] = [];
  for (const t of pool) {
    const text = fill(t, vars);
    if (text !== null) candidates.push({ id: `${key}:${lineId(t)}`, text });
  }
  if (candidates.length === 0) return null;
  const recent = new Set(mem.recent);
  const fresh = candidates.filter((c) => !recent.has(c.id));
  let chosen: { id: string; text: string };
  if (fresh.length > 0) {
    chosen = fresh[pickIndex(fresh.length, rng)]!;
  } else {
    // Every line is recent: the oldest one in memory is the least likely to be noticed.
    const order = new Map(mem.recent.map((id, i) => [id, i] as const));
    chosen = candidates.reduce((a, b) => ((order.get(a.id) ?? 0) <= (order.get(b.id) ?? 0) ? a : b));
  }
  return { utterance: { id: chosen.id, text: chosen.text, kind }, memory: remember(mem, chosen.id) };
}

/** A line for `moment` in this personality's voice (see `sayFromPool`). */
export function sayLine(
  voice: Voice,
  personality: Personality,
  moment: Moment,
  mem: SayMemory,
  rng: Rng,
  vars: SayVars = {},
): { utterance: Utterance; memory: SayMemory } | null {
  return sayFromPool(voice.lines[personality][moment] ?? [], `${moment}:${personality}`, moment, mem, rng, vars);
}

/**
 * A fact the pet has not told yet, introduced in its personality's voice; tapping it opens the source.
 * Works through every fact before any repeats. Null when the species has no facts.
 */
export function sayFact(
  voice: Voice,
  personality: Personality,
  mem: SayMemory,
  rng: Rng,
): { utterance: Utterance; memory: SayMemory } | null {
  if (voice.facts.length === 0) return null;
  const told = new Set(mem.factsTold);
  let untold: readonly Fact[] = voice.facts.filter((f) => !told.has(f.id));
  let factsTold = mem.factsTold;
  if (untold.length === 0) {
    untold = voice.facts;
    factsTold = [];
  }
  const fact = untold[pickIndex(untold.length, rng)]!;
  const frames = voice.factFrames[personality];
  const frame = frames.length > 0 ? frames[pickIndex(frames.length, rng)]! : '{fact}';
  const text = frame.replace('{fact}', fact.text);
  return {
    utterance: { id: `fact:${fact.id}`, text, kind: 'fact', more: { label: fact.source.title, url: fact.source.url } },
    memory: { ...mem, factsTold: [...factsTold, fact.id] },
  };
}

/** Parse saved memory, dropping anything malformed rather than failing the boot. */
export function normalizeMemory(v: unknown): SayMemory {
  if (typeof v !== 'object' || v === null) return emptyMemory();
  const o = v as Record<string, unknown>;
  const strings = (a: unknown): string[] => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
  const recent = strings(o['recent']);
  return { recent: recent.slice(Math.max(0, recent.length - RECENT_LINES)), factsTold: strings(o['factsTold']) };
}
