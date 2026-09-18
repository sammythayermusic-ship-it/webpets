// Whole-document persistence over platform.store. Every save calls `store.set` immediately (so the store's
// in-memory document, which the plugin also writes on exit, is never stale); the disk write (`store.save`) goes
// through immediately for the first save in a window and bursts are coalesced into one trailing write 500 ms
// later. flush() drains everything pending. All store calls for a file are sequenced through one promise chain.
import type { PersistApi } from '../platform/types';
import type { GraveyardDoc, PetDoc, SettingsDoc } from './types';
import { DEFAULT_SCALE, SCALES, SCALE_M, SCALE_S, type Scale } from '../sim/constants';
import type { PetState } from '../sim/types';

export const PET_FILE = 'pet.json';
export const SETTINGS_FILE = 'settings.json';
export const GRAVEYARD_FILE = 'graveyard.json';
export const SAVE_THROTTLE_MS = 500;

/** Current `SettingsDoc.version`. Bumped to 2 when the scale ladder moved from 2/3/4 to 1/2/3. */
export const SETTINGS_VERSION = 2;

export function defaultSettings(): SettingsDoc {
  return {
    version: SETTINGS_VERSION,
    scale: DEFAULT_SCALE,
    muted: false,
    notificationsMuted: false,
    dayNight: 'auto',
    launchAtLogin: false,
    alwaysOnTop: true,
    allDesktops: true,
    overFullscreen: true,
    devClockOffsetMs: 0,
    pendingSkipMs: 0,
  };
}

export function defaultGraveyard(): GraveyardDoc {
  return { version: 1, records: [] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isScale = (v: unknown): v is Scale => (SCALES as readonly number[]).includes(v as number);

export function isPetState(v: unknown): v is PetState {
  if (!isRecord(v)) return false;
  return (
    isStr(v['id']) &&
    isStr(v['name']) &&
    isStr(v['species']) &&
    isStr(v['habitat']) &&
    isStr(v['personality']) &&
    isStr(v['rarity']) &&
    isNum(v['bornAt']) &&
    isNum(v['lastFedAt']) &&
    isNum(v['hungerAtLastFed']) &&
    isNum(v['pantry']) &&
    isNum(v['meals']) &&
    isNum(v['feedBurned']) &&
    isBool(v['alive']) &&
    (v['diedAt'] === undefined || isNum(v['diedAt'])) &&
    isRecord(v['speciesData']) &&
    isNum(v['lastReconciledAt'])
  );
}

export function isPetDoc(v: unknown): v is PetDoc {
  if (!isRecord(v) || v['version'] !== 1) return false;
  if (!isPetState(v['pet'])) return false;
  if (!isNum(v['balance']) || !Number.isInteger(v['balance']) || v['balance'] < 0) return false;
  const l = v['latches'];
  if (!isRecord(l)) return false;
  const p = l['pantryLowFiredForPantry'];
  const d = l['deathAcknowledgedFor'];
  return (p === null || isNum(p)) && (d === null || isStr(d));
}

/**
 * v1 `scale` -> v2 `scale`, mapped to **preserve on-screen size**, not the number.
 *
 * v1 ran a 160x120 grid at 2/3/4 (368x288, 528x408, 688x528); v2 runs 320x240 at 1/2/3 (368x288,
 * 688x528, 1008x768). 2 -> 1 and 4 -> 2 are pixel-identical window sizes. v1's 3 (528x408) has no v2
 * equivalent, so it goes up one step to 688x528 rather than down to 368x288: an unexplained shrink to
 * under half the area is a worse surprise than an unexplained grow, and this keeps the invariant that
 * nothing ever shrinks and nothing jumps more than one rung.
 */
const LEGACY_SCALE_MAP: Readonly<Record<number, Scale>> = Object.freeze({ 2: SCALE_S, 3: SCALE_M, 4: SCALE_M });

/**
 * Settings are merged field by field over the defaults so a partially valid file still loads, and a
 * version-1 document is migrated rather than discarded — returning defaults there would silently wipe
 * the user's mute, day/night and launch-at-login preferences.
 */
export function normalizeSettings(v: unknown): SettingsDoc {
  const d = defaultSettings();
  if (!isRecord(v)) return d;
  const version = v['version'];
  if (version !== 1 && version !== SETTINGS_VERSION) return d;
  const legacy = version === 1;
  const rawScale = v['scale'];
  const scale = legacy
    ? (typeof rawScale === 'number' ? LEGACY_SCALE_MAP[rawScale] : undefined) ?? d.scale
    : isScale(rawScale)
      ? rawScale
      : d.scale;
  const dn = v['dayNight'];
  return {
    version: SETTINGS_VERSION,
    scale,
    muted: isBool(v['muted']) ? v['muted'] : d.muted,
    notificationsMuted: isBool(v['notificationsMuted']) ? v['notificationsMuted'] : d.notificationsMuted,
    dayNight: dn === 'auto' || dn === 'day' || dn === 'night' ? dn : d.dayNight,
    launchAtLogin: isBool(v['launchAtLogin']) ? v['launchAtLogin'] : d.launchAtLogin,
    // No version bump for these. A missing field already falls back to its default, whereas an
    // unrecognised VERSION returns defaults wholesale -- so bumping to add three booleans would throw
    // away every existing user's mute, day/night and launch-at-login preferences.
    alwaysOnTop: isBool(v['alwaysOnTop']) ? v['alwaysOnTop'] : d.alwaysOnTop,
    allDesktops: isBool(v['allDesktops']) ? v['allDesktops'] : d.allDesktops,
    overFullscreen: isBool(v['overFullscreen']) ? v['overFullscreen'] : d.overFullscreen,
    devClockOffsetMs: isNum(v['devClockOffsetMs']) ? v['devClockOffsetMs'] : 0,
    pendingSkipMs: isNum(v['pendingSkipMs']) ? v['pendingSkipMs'] : 0,
  };
}

export function normalizeGraveyard(v: unknown): GraveyardDoc {
  if (!isRecord(v) || v['version'] !== 1 || !Array.isArray(v['records'])) return defaultGraveyard();
  const records = v['records'].filter(
    (r: unknown) => isRecord(r) && isPetState(r['pet']) && isNum(r['diedAt']) && isNum(r['ageMs']) && isNum(r['buriedAt']),
  ) as GraveyardDoc['records'];
  return { version: 1, records };
}

export interface Persistence {
  loadPet(): Promise<PetDoc | null>;
  loadSettings(): Promise<SettingsDoc>;
  loadGraveyard(): Promise<GraveyardDoc>;
  savePet(doc: PetDoc): void;
  saveSettings(doc: SettingsDoc): void;
  saveGraveyard(doc: GraveyardDoc): void;
  /** Write every pending document now and wait for the writes to settle. */
  flush(): Promise<void>;
}

interface Channel {
  save(data: unknown): void;
  flush(): Promise<void>;
}

function createChannel(store: PersistApi, file: string, throttleMs: number): Channel {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false; // a `set` has happened since the last `save`
  let lastWrite = Number.NEGATIVE_INFINITY;
  let inflight: Promise<void> = Promise.resolve();

  const enqueue = (what: string, op: () => Promise<void>): void => {
    inflight = inflight.then(op).catch((err: unknown) => {
      console.warn(`[persistence] ${what} ${file} failed`, err);
    });
  };
  const write = (): void => {
    lastWrite = Date.now();
    dirty = false;
    enqueue('save', () => store.save(file));
  };
  const fire = (): void => {
    timer = null;
    if (dirty) write();
  };
  return {
    save(data) {
      enqueue('set', () => store.set(file, data));
      dirty = true;
      const since = Date.now() - lastWrite;
      if (timer === null && since >= throttleMs) {
        write();
        return;
      }
      if (timer === null) timer = setTimeout(fire, Math.max(0, throttleMs - since));
    },
    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        fire();
      }
      await inflight;
    },
  };
}

export function createPersistence(store: PersistApi, throttleMs: number = SAVE_THROTTLE_MS): Persistence {
  const pet = createChannel(store, PET_FILE, throttleMs);
  const settings = createChannel(store, SETTINGS_FILE, throttleMs);
  const graveyard = createChannel(store, GRAVEYARD_FILE, throttleMs);
  return {
    async loadPet() {
      let raw: unknown = null;
      try {
        raw = await store.load<unknown>(PET_FILE);
      } catch (err) {
        console.warn('[persistence] load pet.json failed', err);
      }
      if (raw === null || raw === undefined) return null;
      if (!isPetDoc(raw)) {
        console.warn('[persistence] pet.json is not a version-1 PetDoc; starting fresh');
        return null;
      }
      return raw;
    },
    async loadSettings() {
      try {
        return normalizeSettings(await store.load<unknown>(SETTINGS_FILE));
      } catch (err) {
        console.warn('[persistence] load settings.json failed', err);
        return defaultSettings();
      }
    },
    async loadGraveyard() {
      try {
        return normalizeGraveyard(await store.load<unknown>(GRAVEYARD_FILE));
      } catch (err) {
        console.warn('[persistence] load graveyard.json failed', err);
        return defaultGraveyard();
      }
    },
    savePet: (doc) => pet.save(doc),
    saveSettings: (doc) => settings.save(doc),
    saveGraveyard: (doc) => graveyard.save(doc),
    async flush() {
      await Promise.all([pet.flush(), settings.flush(), graveyard.flush()]);
    },
  };
}
