// Whole-document persistence over platform.store. `set` goes through immediately for the first save in a window;
// bursts are coalesced into one trailing write 500 ms later. flush() drains everything pending.
import type { PersistApi } from '../platform/types';
import type { GraveyardDoc, PetDoc, SettingsDoc } from './types';
import { SCALES, type Scale } from '../sim/constants';
import type { PetState } from '../sim/types';

export const PET_FILE = 'pet.json';
export const SETTINGS_FILE = 'settings.json';
export const GRAVEYARD_FILE = 'graveyard.json';
export const SAVE_THROTTLE_MS = 500;

export function defaultSettings(): SettingsDoc {
  return {
    version: 1,
    scale: 3,
    muted: false,
    notificationsMuted: false,
    dayNight: 'auto',
    launchAtLogin: false,
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

/** Settings are merged field by field over the defaults so a partially valid file still loads. */
export function normalizeSettings(v: unknown): SettingsDoc {
  const d = defaultSettings();
  if (!isRecord(v) || v['version'] !== 1) return d;
  const dn = v['dayNight'];
  return {
    version: 1,
    scale: isScale(v['scale']) ? v['scale'] : d.scale,
    muted: isBool(v['muted']) ? v['muted'] : d.muted,
    notificationsMuted: isBool(v['notificationsMuted']) ? v['notificationsMuted'] : d.notificationsMuted,
    dayNight: dn === 'auto' || dn === 'day' || dn === 'night' ? dn : d.dayNight,
    launchAtLogin: isBool(v['launchAtLogin']) ? v['launchAtLogin'] : d.launchAtLogin,
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
  let pending: unknown = undefined;
  let hasPending = false;
  let lastWrite = Number.NEGATIVE_INFINITY;
  let inflight: Promise<void> = Promise.resolve();

  const write = (data: unknown): void => {
    lastWrite = Date.now();
    const p = store.save(file, data).catch((err: unknown) => {
      console.warn(`[persistence] save ${file} failed`, err);
    });
    inflight = inflight.then(() => p);
  };
  const fire = (): void => {
    timer = null;
    if (!hasPending) return;
    const data = pending;
    pending = undefined;
    hasPending = false;
    write(data);
  };
  return {
    save(data) {
      const since = Date.now() - lastWrite;
      if (timer === null && since >= throttleMs) {
        write(data);
        return;
      }
      pending = data;
      hasPending = true;
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
