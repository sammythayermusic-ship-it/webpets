// The talk controller: once a second it asks the brain whether the pet has something to say, turns the
// answer into words (a library line, a fact, or a line Claude wrote) and hands them to the bubble.
// Everything it touches comes in through `TalkEnv`, so it runs the same in the app, the browser and tests.

import type { Personality, Rng, Species } from '../sim/types';
import type { Moment, Utterance, Voice } from '../brain/types';
import { emptyMemory, normalizeMemory, sayFact, sayLine, type SayMemory } from '../brain/say';
import { decide, initialTalk, normalizeTalk, react, type Reaction, type TalkState, type Volunteer } from '../brain/talk';
export type { Volunteer };
import { WRITTEN_SHARE, addSpend, buildLinePrompt, canSpend, cleanLine, type LinePrompt, type Spend } from '../brain/writer';

/** What the controller keeps between launches. */
export interface TalkMemory {
  memory: SayMemory;
  talk: TalkState;
  spend: Spend | null;
}

export interface LineWriter {
  /** A key is set (cheap; asked once a minute at most). */
  available(): Promise<boolean>;
  write(prompt: LinePrompt): Promise<{ text: string | null; usd: number }>;
}

export interface TalkEnv {
  now(): number;
  rng: Rng;
  pet(): { species: Species; personality: Personality; name: string; alive: boolean };
  voice(species: Species): Voice | null;
  present(): boolean;
  night(): boolean;
  /** The pet is up and about (not resting for the night). */
  awake(): boolean;
  /** You are typing, or nobody can see the pet: nothing volunteered, and hunger waits. */
  busy(): boolean;
  muted(): boolean;
  /** Hunger that lost out to the gap after another bubble is said once the gap clears, if this is still true. */
  stillTrue(moment: Reaction): boolean;
  /** Plain words about right now, for a written line ("it is evening", "it ate an hour ago"). */
  situation(): string[];
  writer: LineWriter | null;
  dailyCapUsd(): number;
  load(): unknown;
  save(m: TalkMemory): void;
  show(u: Utterance): void;
}

export interface TalkController {
  /** Ask the brain; call about once a second. */
  tick(): void;
  /** Something happened to the pet. True when it said something about it. */
  react(moment: Reaction): boolean;
  /** Say a thought or a fact now, skipping the brain's timing (dev panel, harness stills). */
  speak(v: Volunteer): void;
  /** A new pet: forget what the old one said. */
  reset(): void;
  /** For the dev panel and the harness. */
  snapshot(): TalkMemory;
}

/** Local calendar day, "2026-10-31". */
export function dayKeyOf(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const WRITER_CHECK_MS = 60_000;
/** Moments too important to lose to the gap after another bubble: said late rather than never. */
const OWED: ReadonlySet<Reaction> = new Set<Reaction>(['hungry', 'starving']);

export function createTalk(env: TalkEnv): TalkController {
  const saved = env.load();
  const o = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {};
  let memory = normalizeMemory(o['memory']);
  let talk = normalizeTalk(o['talk'], env.now(), env.rng);
  let spend = normalizeSpend(o['spend']);
  let writing = false;
  let writerOk = false;
  let writerCheckedAt = Number.NEGATIVE_INFINITY;
  /** The last few things said, as text, for a written line to avoid. */
  let lastSaid: string[] = [];
  /** A hunger line still to say once the gap clears. */
  let owed: Reaction | null = null;

  function persist(): void {
    env.save({ memory, talk, spend });
  }

  function vars(): Record<string, string> {
    return { name: env.pet().name };
  }

  function libraryLine(moment: Moment): Utterance | null {
    const { species, personality } = env.pet();
    const voice = env.voice(species);
    if (!voice) return null;
    const r = sayLine(voice, personality, moment, memory, env.rng, vars());
    if (!r) return null;
    memory = r.memory;
    return r.utterance;
  }

  function fact(): Utterance | null {
    const { species, personality } = env.pet();
    const voice = env.voice(species);
    if (!voice) return null;
    const r = sayFact(voice, personality, memory, env.rng);
    if (!r) return libraryLine('thought');
    memory = r.memory;
    return r.utterance;
  }

  function checkWriter(): void {
    const now = env.now();
    if (!env.writer || now - writerCheckedAt < WRITER_CHECK_MS) return;
    writerCheckedAt = now;
    env.writer.available().then(
      (ok) => (writerOk = ok),
      () => (writerOk = false),
    );
  }

  /** A thought Claude writes; falls back to the library when anything at all goes wrong. */
  function writtenThought(): void {
    const writer = env.writer;
    if (!writer) return;
    writing = true;
    const { species, personality, name } = env.pet();
    const prompt = buildLinePrompt({ species, personality, name, moment: 'thought', situation: env.situation(), recent: lastSaid });
    const day = dayKeyOf(env.now());
    writer
      .write(prompt)
      .then(
        (r) => {
          spend = addSpend(spend, day, r.usd);
          const text = r.text !== null ? cleanLine(r.text) : null;
          const u: Utterance | null = text !== null ? { id: `written:${env.now()}`, text, kind: 'thought' } : libraryLine('thought');
          if (u) say(u);
        },
        () => {
          const u = libraryLine('thought');
          if (u) say(u);
        },
      )
      .finally(() => {
        writing = false;
        persist();
      });
  }

  function say(u: Utterance): void {
    if (env.muted() || !env.pet().alive) return;
    lastSaid = [...lastSaid, u.text].slice(-6);
    env.show(u);
  }

  function reactNow(moment: Reaction): boolean {
    // Hunger waits until you can see it and are not mid-sentence; replies to what you just did do not.
    if (OWED.has(moment) && env.busy()) return false;
    const r = react(talk, moment, { now: env.now(), muted: env.muted(), alive: env.pet().alive, rng: env.rng });
    talk = r.state;
    if (!r.say) return false;
    const u = libraryLine(moment);
    if (u) say(u);
    persist();
    return true;
  }

  function speakVolunteer(v: Volunteer): void {
    if (v === 'fact') {
      const u = fact();
      if (u) say(u);
      return;
    }
    if (v === 'thought' && env.writer && writerOk && !writing && canSpend(spend, dayKeyOf(env.now()), env.dailyCapUsd()) && env.rng() < WRITTEN_SHARE) {
      writtenThought();
      return;
    }
    const u = libraryLine(v);
    if (u) say(u);
  }

  return {
    tick() {
      checkWriter();
      const now = env.now();
      const d = new Date(now);
      const r = decide(talk, {
        now,
        present: env.present(),
        awake: env.awake(),
        busy: env.busy(),
        muted: env.muted(),
        alive: env.pet().alive,
        night: env.night(),
        dayKey: dayKeyOf(now),
        hour: d.getHours(),
        rng: env.rng,
      });
      const changed = r.state !== talk;
      talk = r.state;
      if (r.say) speakVolunteer(r.say);
      if (r.say || changed) persist();
      if (owed !== null && !r.say && (!env.stillTrue(owed) || reactNow(owed))) owed = null;
    },
    react(moment) {
      const said = reactNow(moment);
      owed = !said && OWED.has(moment) ? moment : null;
      return said;
    },
    speak(v) {
      speakVolunteer(v);
      persist();
    },
    reset() {
      memory = emptyMemory();
      talk = initialTalk(env.now(), env.rng);
      lastSaid = [];
      owed = null;
      persist();
    },
    snapshot() {
      return { memory, talk, spend };
    },
  };
}

function normalizeSpend(v: unknown): Spend | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  return typeof o['day'] === 'string' && typeof o['usd'] === 'number' && Number.isFinite(o['usd']) ? { day: o['day'], usd: o['usd'] } : null;
}
