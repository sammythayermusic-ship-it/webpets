// The goldfish's voice: its lines, its facts, how each personality brings a fact up, what it says
// when you talk with it (chat.ts), what it says about your teams and the news (world.ts), and what
// it says on a day worth sharing (milestones.ts).
import type { Voice } from '../../../brain/types';
import { FISH_CHAT } from './chat';
import { FISH_FACTS } from './facts';
import { FISH_FACT_FRAMES, FISH_LINES } from './lines';
import { FISH_MILESTONES } from './milestones';
import { FISH_WORLD } from './world';

export const FISH_VOICE: Voice = {
  lines: FISH_LINES,
  facts: FISH_FACTS,
  factFrames: FISH_FACT_FRAMES,
  chat: FISH_CHAT,
  world: FISH_WORLD,
  milestones: FISH_MILESTONES,
};
