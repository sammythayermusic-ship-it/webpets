// The hamster's voice, from its Phase 0 line pools until Step G gives it a full library and facts:
// `idle` lines are its thoughts, `wake` lines its welcome back.
import type { Personality } from '../../sim/types';
import type { Moment, Voice } from '../../brain/types';
import { HAMSTER_LINES } from './lines';

const PERSONALITIES: readonly Personality[] = ['sarcastic', 'anxious', 'zen', 'hyper'];

function linesOf(p: Personality): Partial<Record<Moment, readonly string[]>> {
  const pools = HAMSTER_LINES[p];
  return { thought: pools.idle, fed: pools.fed, hungry: pools.hungry, starving: pools.starving, 'welcome-back': pools.wake };
}

export const HAMSTER_VOICE: Voice = {
  lines: Object.fromEntries(PERSONALITIES.map((p) => [p, linesOf(p)])) as Voice['lines'],
  facts: [],
  factFrames: { sarcastic: [], anxious: [], zen: [], hyper: [] },
};
