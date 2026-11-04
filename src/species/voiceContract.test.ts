// Every pet gets the brain (AFTER-BAKEOFF Step G): the brain is one shared module and each species
// brings a whole voice. This is the contract every implemented species has to meet, so a new one
// cannot ship half a voice and fall silent in chat, on game day or on its birthday. The per-species
// tests (fish/voice/voice.test.ts, hamster/voice/voice.test.ts) hold the fuller rules; this one
// asks only that nothing is missing.
import { describe, expect, it } from 'vitest';
import type { Personality } from '../sim/types';
import type { BondMoment, ChatIntent, MilestoneMoment, Moment, TeachMoment, WorldMoment } from '../brain/types';
import { implementedSpecies, requireSpecies } from './index';

const PERSONALITIES: readonly Personality[] = ['sarcastic', 'anxious', 'zen', 'hyper'];
const MOMENTS = Object.keys({
  thought: 1, fed: 1, meal: 1, hungry: 1, starving: 1, tap: 1, visit: 1, 'welcome-back': 1, lonely: 1, morning: 1, night: 1, feeder: 1,
} satisfies Record<Moment, 1>) as Moment[];
const CHAT_INTENTS = Object.keys({
  hello: 1, 'how-are-you': 1, 'what-doing': 1, love: 1, praise: 1, thanks: 1, bye: 1, sad: 1, happy: 1, tired: 1,
  bored: 1, 'hungry-talk': 1, 'name-ask': 1, joke: 1, question: 1, unknown: 1,
} satisfies Record<ChatIntent, 1>) as ChatIntent[];
const TEACH_MOMENTS = Object.keys({
  'ask-interest': 1, 'ask-team': 1, 'which-team': 1, 'ask-name': 1, 'saved-interest': 1, 'saved-team': 1,
  'saved-name': 1, declined: 1, 'already-know': 1,
} satisfies Record<TeachMoment, 1>) as TeachMoment[];
const BOND_MOMENTS = Object.keys({
  'thought-you': 1, 'thought-interest': 1, 'thought-team': 1, 'visit-close': 1, 'mood-check': 1, 'joke-knock': 1, 'joke-shared': 1,
} satisfies Record<BondMoment, 1>) as BondMoment[];
const WORLD_MOMENTS = Object.keys({
  'game-day': 1, live: 1, won: 1, lost: 1, tied: 1, 'still-happy': 1, mope: 1, 'no-game': 1, news: 1, 'news-interest': 1,
} satisfies Record<WorldMoment, 1>) as WorldMoment[];
const MILESTONE_MOMENTS = Object.keys({ birthday: 1, meals: 1, bond: 1, 'big-win': 1 } satisfies Record<MilestoneMoment, 1>) as MilestoneMoment[];

describe.each(implementedSpecies())('the %s has the whole brain', (species) => {
  const voice = requireSpecies(species).voice;

  it('has lines for every personality in every moment, and frames for its facts', () => {
    for (const p of PERSONALITIES) {
      for (const m of MOMENTS) expect(voice.lines[p][m]?.length ?? 0, `${species} ${p}/${m}`).toBeGreaterThanOrEqual(4);
      expect(voice.factFrames[p].length, `${species} ${p} fact frames`).toBeGreaterThanOrEqual(3);
    }
    expect(voice.facts.length, `${species} facts`).toBeGreaterThanOrEqual(100);
  });

  it('can be talked to, and gets to know you', () => {
    expect(voice.chat, `${species} has no chat voice: it cannot be typed to`).toBeDefined();
    for (const p of PERSONALITIES) {
      for (const m of CHAT_INTENTS) expect(voice.chat!.chat[p][m].length, `${species} chat ${p}/${m}`).toBeGreaterThanOrEqual(3);
      for (const m of TEACH_MOMENTS) expect(voice.chat!.teach[p][m].length, `${species} teach ${p}/${m}`).toBeGreaterThanOrEqual(2);
      for (const m of BOND_MOMENTS) expect(voice.chat!.bond[p][m].length, `${species} bond ${p}/${m}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('follows your teams and the news, and marks the days worth sharing', () => {
    expect(voice.world, `${species} has no world lines`).toBeDefined();
    expect(voice.milestones, `${species} has no milestone lines`).toBeDefined();
    for (const p of PERSONALITIES) {
      for (const m of WORLD_MOMENTS) expect(voice.world![p][m].length, `${species} world ${p}/${m}`).toBeGreaterThanOrEqual(4);
      for (const m of MILESTONE_MOMENTS) expect(voice.milestones![p][m].length, `${species} milestones ${p}/${m}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('shares no line with another species: each one is its own character', () => {
    const mine = new Set(PERSONALITIES.flatMap((p) => MOMENTS.flatMap((m) => voice.lines[p][m] ?? [])));
    for (const other of implementedSpecies()) {
      if (other === species) continue;
      const theirs = requireSpecies(other).voice;
      const shared = PERSONALITIES.flatMap((p) => MOMENTS.flatMap((m) => theirs.lines[p][m] ?? [])).filter((l) => mine.has(l));
      expect(shared, `${species} and ${other} say the same thing`).toEqual([]);
    }
  });
});
