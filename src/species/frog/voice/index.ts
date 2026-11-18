// The frog's voice: its lines, its facts, how each personality brings a fact up, what it says when
// you talk with it (chat.ts), what it says about your teams and the news (world.ts), and what it says
// on a day worth sharing (milestones.ts). Same shape as the fish's and the hamster's, through the same
// brain; none of the same jokes.
import type { Voice } from '../../../brain/types';
import { FROG_CHAT } from './chat';
import { FROG_FACTS } from './facts';
import { FROG_FACT_FRAMES, FROG_LINES } from './lines';
import { FROG_MILESTONES } from './milestones';
import { FROG_WORLD } from './world';

export const FROG_VOICE: Voice = {
  lines: FROG_LINES,
  facts: FROG_FACTS,
  factFrames: FROG_FACT_FRAMES,
  chat: FROG_CHAT,
  world: FROG_WORLD,
  milestones: FROG_MILESTONES,
};
