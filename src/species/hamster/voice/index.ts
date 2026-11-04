// The hamster's voice (AFTER-BAKEOFF Step G): its lines, its facts, how each personality brings a
// fact up, what it says when you talk with it (chat.ts), what it says about your teams and the news
// (world.ts), and what it says on a day worth sharing (milestones.ts). Same shape as the fish's,
// through the same brain; none of the same jokes.
import type { Voice } from '../../../brain/types';
import { HAMSTER_CHAT } from './chat';
import { HAMSTER_FACTS } from './facts';
import { HAMSTER_FACT_FRAMES, HAMSTER_LINES } from './lines';
import { HAMSTER_MILESTONES } from './milestones';
import { HAMSTER_WORLD } from './world';

export const HAMSTER_VOICE: Voice = {
  lines: HAMSTER_LINES,
  facts: HAMSTER_FACTS,
  factFrames: HAMSTER_FACT_FRAMES,
  chat: HAMSTER_CHAT,
  world: HAMSTER_WORLD,
  milestones: HAMSTER_MILESTONES,
};
