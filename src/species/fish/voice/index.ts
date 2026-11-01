// The goldfish's voice: its lines, its facts, and how each personality brings a fact up.
import type { Voice } from '../../../brain/types';
import { FISH_FACTS } from './facts';
import { FISH_FACT_FRAMES, FISH_LINES } from './lines';

export const FISH_VOICE: Voice = { lines: FISH_LINES, facts: FISH_FACTS, factFrames: FISH_FACT_FRAMES };
