// Whole-document persistence over platform.store. Every save calls `store.set` immediately (so the store's
// in-memory document, which the plugin also writes on exit, is never stale); the disk write (`store.save`) goes
// through immediately for the first save in a window and bursts are coalesced into one trailing write 500 ms
// later. flush() drains everything pending. All store calls for a file are sequenced through one promise chain.
import type { PersistApi } from '../platform/types';
import type { GraveyardDoc, NotificationLatches, PetDoc, SettingsDoc } from './types';
import { clampScale, DEFAULT_SCALE, HOUR_MS, MAX_SCALE, MIN_SCALE, SCALE_L, SCALE_M, SCALE_S, type Scale } from '../sim/constants';
import type { NeedsState } from '../sim/needs';
import type { GraveRecord, Personality, PetState } from '../sim/types';
import { DEFAULT_DAILY_CAP_USD } from '../brain/writer';

export const PET_FILE = 'pet.json';
/** What the pet has said, its talk timing, the bond and what you said in chat (src/ui/talk.ts). One per pet. */
export const BRAIN_FILE = 'brain.json';
export const SETTINGS_FILE = 'settings.json';
export const GRAVEYARD_FILE = 'graveyard.json';
export const SAVE_THROTTLE_MS = 500;

/** Current `SettingsDoc.version`. Bumped to 2 when the scale ladder moved from 2/3/4 to 1/2/3. */
export const SETTINGS_VERSION = 2;

/**
 * Current `PetDoc.version`. Bumped to 2 when a meal went from 27 hours to 12, and to 3 when food became
 * free (the `balance` went, `feedBurned` became `foodEaten`, the personality `LEGACY_HYPER` became `hyper`).
 * See `migratePetDoc`.
 */
export const PET_VERSION = 3;

/** Current `GraveyardDoc.version`. Bumped to 2 when the buried pets' `feedBurned` became `foodEaten`. */
export const GRAVEYARD_VERSION = 2;

/** What versions 1 and 2 called the `hyper` personality (same behaviour); the only place the old name survives. */
export const LEGACY_HYPER = 'degen';

/** A pet as versions 1 and 2 saved it: `feedBurned` where `foodEaten` is now, and `LEGACY_HYPER` for `hyper`. */
export type LegacyPetState = Omit<PetState, 'foodEaten' | 'personality'> & {
  feedBurned: number;
  personality: Personality | typeof LEGACY_HYPER;
};

/**
 * `pet.json` versions 1 and 2. Version 1 predates the twice-a-day hunger clock; both carry a food
 * `balance` beside the pet, from when food was bought. Read only, never written.
 */
export interface LegacyPetDoc {
  version: 1 | 2;
  pet: LegacyPetState;
  balance?: number;
  latches: NotificationLatches;
  needs?: NeedsState;
}

/** Whatever a recognised `pet.json` holds: the current document or one `migratePetDoc` upgrades. */
export type StoredPetDoc = PetDoc | LegacyPetDoc;

/**
 * The hunger rate a version-1 document was written under: a 45-point meal against a 60-hour bar.
 *
 * This is the ONLY place the old numbers survive, and they must never be imported from
 * `DEFAULT_CONSTANTS` -- the whole point is to read a v1 anchor with v1 rules.
 */
const LEGACY_V1_DECAY_PER_HOUR = 100 / 60;

export function defaultSettings(): SettingsDoc {
  return {
    version: SETTINGS_VERSION,
    scale: DEFAULT_SCALE,
    muted: false,
    notificationsMuted: false,
    talkMuted: false,
    dailyCapUsd: DEFAULT_DAILY_CAP_USD,
    cardOffered: false,
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
  return { version: GRAVEYARD_VERSION, records: [] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isScale = (v: unknown): v is Scale =>
  typeof v === 'number' && Number.isInteger(v) && v >= MIN_SCALE && v <= MAX_SCALE;

/** Every pet field that has not changed name across document versions. */
function isPetCore(v: Record<string, unknown>): boolean {
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
    isBool(v['alive']) &&
    (v['diedAt'] === undefined || isNum(v['diedAt'])) &&
    isRecord(v['speciesData']) &&
    isNum(v['lastReconciledAt'])
  );
}

export function isPetState(v: unknown): v is PetState {
  return isRecord(v) && isPetCore(v) && isNum(v['foodEaten']);
}

export function isLegacyPetState(v: unknown): v is LegacyPetState {
  return isRecord(v) && isPetCore(v) && isNum(v['feedBurned']);
}

function isLatches(l: unknown): l is NotificationLatches {
  if (!isRecord(l)) return false;
  const p = l['pantryLowFiredForPantry'];
  const d = l['deathAcknowledgedFor'];
  return (p === null || isNum(p)) && (d === null || isStr(d));
}

/** A current (version 3) document. */
export function isPetDoc(v: unknown): v is PetDoc {
  return isRecord(v) && v['version'] === PET_VERSION && isPetState(v['pet']) && isLatches(v['latches']);
}

/** A version 1 or 2 document. Its `balance` is not checked: it is dropped on upgrade. */
export function isLegacyPetDoc(v: unknown): v is LegacyPetDoc {
  return (
    isRecord(v) &&
    (v['version'] === 1 || v['version'] === 2) &&
    isLegacyPetState(v['pet']) &&
    isLatches(v['latches'])
  );
}

/** Anything `loadPet` will hand to `migratePetDoc`. */
export function isStoredPetDoc(v: unknown): v is StoredPetDoc {
  return isPetDoc(v) || isLegacyPetDoc(v);
}

/** The free-food rename, for any pet saved before it: `feedBurned` -> `foodEaten`, `LEGACY_HYPER` -> `hyper`. */
export function upgradePetState(pet: LegacyPetState): PetState {
  const { feedBurned, personality, ...rest } = pet;
  return { ...rest, personality: personality === LEGACY_HYPER ? 'hyper' : personality, foodEaten: feedBurned };
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
/** Version-1 documents, when the ladder was 2/3/4 and the grid was half its current size. */
const LEGACY_SCALE_MAP: Readonly<Record<number, Scale>> = Object.freeze({ 2: SCALE_S, 3: SCALE_M, 4: SCALE_M });
/**
 * Version-2 documents, when `scale` was a whole multiplier on a three-rung ladder. The field now counts
 * EIGHTHS, so a stored `2` means 2x and must become 16 — read as-is it would be a quarter of a rung,
 * a 128x108 window. Renaming the field rather than bumping the version keeps `normalizeSettings` off
 * its "unknown version, return defaults" branch, which would have discarded every other preference.
 */
const RUNG_SCALE_MAP: Readonly<Record<number, Scale>> = Object.freeze({ 1: SCALE_S, 2: SCALE_M, 3: SCALE_L });

/**
 * Settings are merged field by field over the defaults so a partially valid file still loads, and a
 * version-1 document is migrated rather than discarded — returning defaults there would silently wipe
 * the user's mute, day/night and launch-at-login preferences.
 */
/**
 * The on-disk shape. `scale` is written as `scaleSteps` because the number it holds changed meaning:
 * it counts eighths now, where it used to be a whole multiplier on a three-rung ladder. Writing it
 * under the old name would make a saved `24` read back as an unrecognised rung and silently reset the
 * user's window size on every launch, which is exactly the class of bug the v1 migration exists for.
 */
export function toSettingsFile(doc: SettingsDoc): Record<string, unknown> {
  const { scale, ...rest } = doc;
  return { ...rest, scaleSteps: scale };
}

export function normalizeSettings(v: unknown): SettingsDoc {
  const d = defaultSettings();
  if (!isRecord(v)) return d;
  const version = v['version'];
  if (version !== 1 && version !== SETTINGS_VERSION) return d;
  const legacy = version === 1;
  // Three generations of this field. `scaleSteps` is the current one and wins outright; a v2 `scale`
  // is a whole multiplier on the old three-rung ladder; a v1 `scale` is a rung of the ladder before
  // that, when the grid was half its current size. Each is mapped rather than discarded.
  const rawSteps = v['scaleSteps'];
  const rawScale = v['scale'];
  const scale = isScale(rawSteps)
    ? rawSteps
    : legacy
      ? ((typeof rawScale === 'number' ? LEGACY_SCALE_MAP[rawScale] : undefined) ?? d.scale)
      : ((typeof rawScale === 'number' ? RUNG_SCALE_MAP[rawScale] : undefined) ?? d.scale);
  const dn = v['dayNight'];
  return {
    version: SETTINGS_VERSION,
    scale: clampScale(scale),
    muted: isBool(v['muted']) ? v['muted'] : d.muted,
    notificationsMuted: isBool(v['notificationsMuted']) ? v['notificationsMuted'] : d.notificationsMuted,
    talkMuted: isBool(v['talkMuted']) ? v['talkMuted'] : d.talkMuted,
    dailyCapUsd: isNum(v['dailyCapUsd']) && v['dailyCapUsd'] >= 0 ? v['dailyCapUsd'] : d.dailyCapUsd,
    cardOffered: isBool(v['cardOffered']) ? v['cardOffered'] : d.cardOffered,
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

/**
 * Version 1 records carry pets in the pre-free-food shape; they are upgraded rather than filtered out,
 * which is what a plain `isPetState` check would have done to every pet ever buried.
 */
export function normalizeGraveyard(v: unknown): GraveyardDoc {
  if (!isRecord(v) || (v['version'] !== 1 && v['version'] !== GRAVEYARD_VERSION) || !Array.isArray(v['records'])) {
    return defaultGraveyard();
  }
  const records: GraveRecord[] = [];
  for (const r of v['records'] as unknown[]) {
    if (!isRecord(r)) continue;
    const { diedAt, ageMs, buriedAt } = r;
    if (!isNum(diedAt) || !isNum(ageMs) || !isNum(buriedAt)) continue;
    const pet = r['pet'];
    if (isPetState(pet)) records.push({ pet, diedAt, ageMs, buriedAt });
    else if (isLegacyPetState(pet)) records.push({ pet: upgradePetState(pet), diedAt, ageMs, buriedAt });
  }
  return { version: GRAVEYARD_VERSION, records };
}

/**
 * Brings any stored document up to the current version. Identity on a current document, so a no-op
 * migration never marks the file dirty.
 *
 * Version 2 -> 3 (free food) is a rename only: the food `balance` is dropped, `feedBurned` becomes
 * `foodEaten`, and the `LEGACY_HYPER` personality becomes `hyper` (same behaviour, new name). The pantry, now
 * the holiday feeder, keeps whatever food it held.
 *
 * Version 1 -> 2 carries a pet across the twice-a-day retune without changing the hunger it is showing.
 *
 * Hunger is never stored. It is derived from the anchor `(hungerAtLastFed, lastFedAt)` every time it is
 * read, so making the clock 2.5x faster silently re-simulates every existing pet at the new speed: an
 * anchor that read 65% under the old rules reads near zero under the new ones, and `reconcile` would
 * then replay the whole hungry -> starving -> dying-soon -> died chain as four real desktop
 * notifications on the first tick. The pet would appear to have starved because a constant changed.
 *
 * So: read the hunger with the OLD rate, re-anchor it at `now`, and let the new clock start from there.
 * The number on screen is identical either side of the upgrade; only its future slope changes.
 * `lastReconciledAt = now` is what suppresses the retroactive event burst.
 *
 * Deliberately one-way and deliberately generous. A pet that has been left long enough to be dead under
 * the OLD rules is re-anchored at zero and given the new death window rather than being killed on load:
 * an upgrade should never be the thing that ends a pet. A pet that is ALREADY dead is untouched.
 */
export function migratePetDoc(doc: StoredPetDoc, now: number): PetDoc {
  if (doc.version === PET_VERSION) return doc;
  let pet = doc.pet;
  if (doc.version === 1 && pet.alive) {
    const hours = Math.max(0, now - pet.lastFedAt) / HOUR_MS;
    const legacyHunger = Math.max(0, Math.min(100, pet.hungerAtLastFed - LEGACY_V1_DECAY_PER_HOUR * hours));
    pet = { ...pet, hungerAtLastFed: legacyHunger, lastFedAt: now, lastReconciledAt: now };
  }
  return {
    version: PET_VERSION,
    pet: upgradePetState(pet),
    latches: doc.latches,
    ...(doc.needs === undefined ? {} : { needs: doc.needs }),
  };
}

export interface Persistence {
  /** The document as stored, any recognised version; the store runs `migratePetDoc` on it at boot. */
  loadPet(): Promise<StoredPetDoc | null>;
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
      if (!isStoredPetDoc(raw)) {
        console.warn('[persistence] pet.json is not a recognised PetDoc; starting fresh');
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
    saveSettings: (doc) => settings.save(toSettingsFile(doc)),
    saveGraveyard: (doc) => graveyard.save(doc),
    async flush() {
      await Promise.all([pet.flush(), settings.flush(), graveyard.flush()]);
    },
  };
}
