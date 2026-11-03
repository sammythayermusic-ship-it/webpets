// The "Get to know me" window (card.html; opened by src-tauri/src/focus.rs). It shares the profile
// with the habitat window through the store plugin and an event (src/app/profile.ts), and reads the
// pet's name and the bond from their files, read only. Esc or Done closes it.

import { createTauriPlatform } from './platform/tauri';
import { createProfileStore } from './app/profile';
import { BRAIN_FILE, PET_FILE } from './app/persistence';
import { BOND_WORDS, bondLevel, bondNow, normalizeBond } from './brain/bond';
import { INTERESTS } from './brain/data/interests';
import { LEAGUES, TEAMS } from './brain/data/teams';
import { mountCard } from './ui/card';

async function main(): Promise<void> {
  const root = document.getElementById('card');
  if (!root) throw new Error('#card missing');
  const platform = createTauriPlatform();
  const profile = createProfileStore(platform);
  await profile.ready;

  let petName = 'your pet';
  let bondWord: string | null = null;
  const readPet = async (): Promise<void> => {
    const pet = await platform.store.load<{ pet?: { name?: unknown; alive?: unknown } }>(PET_FILE).catch(() => null);
    if (typeof pet?.pet?.name === 'string' && pet.pet.name.length > 0) petName = pet.pet.name;
    const brain = await platform.store.load<{ bond?: unknown }>(BRAIN_FILE).catch(() => null);
    if (brain && brain.bond !== undefined) bondWord = BOND_WORDS[bondLevel(bondNow(normalizeBond(brain.bond, Date.now()), Date.now()).points)];
  };
  await readPet();

  const close = (): void => void platform.card.close();
  const card = mountCard(root, {
    profile,
    leagues: LEAGUES,
    teams: TEAMS,
    interests: INTERESTS,
    petName: () => petName,
    bondWord: () => bondWord,
    onForget: () => void platform.events.emit('forget-me'),
    onDone: close,
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  // Verification builds only (docs/HARNESS.md `cardDo`); tree-shaken out of a normal build.
  if (import.meta.env.VITE_WEBPETS_HARNESS === '1') void import('./dev/cardHarness').then((m) => m.installCardHarness(root));
  // A new pet while the card is open: show its name.
  window.addEventListener('focus', () => void readPet().then(() => card.refresh()));
}

main().catch((e: unknown) => {
  console.error('[card] failed to open', e);
  document.body.textContent = 'Something went wrong opening this card.';
});
