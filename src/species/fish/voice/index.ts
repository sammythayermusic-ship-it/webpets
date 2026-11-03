// The goldfish's voice: its lines, its facts, how each personality brings a fact up, and what it says
// when you talk with it (chat.ts).
import type { Voice } from '../../../brain/types';
import { FISH_CHAT } from './chat';
import { FISH_FACTS } from './facts';
import { FISH_FACT_FRAMES, FISH_LINES } from './lines';

export const FISH_VOICE: Voice = { lines: FISH_LINES, facts: FISH_FACTS, factFrames: FISH_FACT_FRAMES, chat: FISH_CHAT };
