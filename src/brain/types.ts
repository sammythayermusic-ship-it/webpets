// The pet's brain: what it says, and when. Shared by every species (AFTER-BAKEOFF Step G); each species
// brings only its voice. Pure: imports nothing from outside src/brain except src/sim types.

import type { Personality } from '../sim/types';

/** The situations a pet has something to say about. A fact is not a moment; it is a thought with a source. */
export type Moment =
  | 'thought' // unprompted, while you are around or now and then
  | 'fed' // a bite of food
  | 'meal' // a meal finished
  | 'hungry'
  | 'starving'
  | 'tap' // a knock on the glass
  | 'visit' // you came back after a few minutes away
  | 'welcome-back' // you came back after hours or days
  | 'lonely' // nobody has come by for hours
  | 'morning'
  | 'night'
  | 'feeder'; // the holiday feeder fed it while you were away

/** Where a fact comes from: shown when you tap the bubble. */
export interface Source {
  title: string;
  url: string;
}

/** One true thing, in plain words a child can read. `text` is a whole sentence; it must be supported by `source`. */
export interface Fact {
  id: string;
  text: string;
  source: Source;
}

/** A species' voice: what each personality says in each moment, its facts, and how each personality brings a fact up. */
export interface Voice {
  lines: Record<Personality, Partial<Record<Moment, readonly string[]>>>;
  facts: readonly Fact[];
  /** Templates containing `{fact}`, per personality ("Fun fact, since you didn't ask: {fact}"). */
  factFrames: Record<Personality, readonly string[]>;
}

/** What the bubble shows, and what tapping it opens. */
export interface Utterance {
  /** Stable across launches, so the pet does not repeat itself ("thought:zen:1a2b3c", "fact:gf-012"). */
  id: string;
  text: string;
  kind: Moment | 'fact';
  more?: { label: string; url: string };
}
