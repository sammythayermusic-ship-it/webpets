// Your profile on disk (profile.json), shared by the habitat window and the "Get to know me" card.
// Both windows read the same file through the store plugin; whoever changes it saves at once and
// tells the other, which reloads. The rules for what a profile holds are in src/brain/profile.ts.

import { emptyProfile, normalizeProfile, type Profile } from '../brain/profile';
import type { Platform } from '../platform/types';

export const PROFILE_FILE = 'profile.json';

export interface ProfileStore {
  /** Resolves once the saved profile has been read. */
  ready: Promise<void>;
  get(): Profile;
  /** Save and tell the other window. */
  set(p: Profile): void;
  /** "Forget me": an empty profile, saved. */
  forget(): void;
  subscribe(cb: (p: Profile) => void): () => void;
  destroy(): void;
}

export function createProfileStore(platform: Platform, now: () => number = Date.now): ProfileStore {
  let profile = emptyProfile(now());
  const listeners = new Set<(p: Profile) => void>();

  function publish(p: Profile): void {
    profile = p;
    for (const cb of Array.from(listeners)) cb(p);
  }

  async function reload(): Promise<void> {
    const doc = await platform.store.load<unknown>(PROFILE_FILE).catch(() => null);
    publish(normalizeProfile(doc, now()));
  }

  function set(p: Profile): void {
    publish(p);
    void platform.store
      .set(PROFILE_FILE, p)
      .then(() => platform.store.save(PROFILE_FILE))
      .then(() => platform.events.emit('profile-changed'))
      .catch((e: unknown) => console.error('[profile] save failed', e));
  }

  const off = platform.events.on('profile-changed', () => void reload());

  return {
    ready: reload(),
    get: () => profile,
    set,
    forget: () => set(emptyProfile(now())),
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    destroy() {
      off();
      listeners.clear();
    },
  };
}
