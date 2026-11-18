// The chicken's voice (PHASE-NEXT Step 5): its lines, its facts, how each personality brings a fact
// up, what it says when you talk with it (chat.ts), what it says about your teams and the news
// (world.ts), and what it says on a day worth sharing (milestones.ts). Same shape as the fish's and
// the hamster's, through the same brain; none of the same jokes. One voice serves the chick and the
// hen it grows into, so nothing in it is true of only one of them.
import type { Voice } from '../../../brain/types';
import { CHICKEN_CHAT } from './chat';
import { CHICKEN_FACTS } from './facts';
import { CHICKEN_FACT_FRAMES, CHICKEN_LINES } from './lines';
import { CHICKEN_MILESTONES } from './milestones';
import { CHICKEN_WORLD } from './world';

export const CHICKEN_VOICE: Voice = {
  lines: CHICKEN_LINES,
  facts: CHICKEN_FACTS,
  factFrames: CHICKEN_FACT_FRAMES,
  chat: CHICKEN_CHAT,
  world: CHICKEN_WORLD,
  milestones: CHICKEN_MILESTONES,
};
