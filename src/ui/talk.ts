// The talk controller: once a second it asks the brain whether the pet has something to say, turns the
// answer into words (a library line, a fact, or a line Claude wrote) and hands them to the bubble. It
// also answers what you type (Step E), keeps the bond, and once the bond allows, brings up you.
// Everything it touches comes in through `TalkEnv`, so it runs the same in the app, the browser and tests.

import type { Personality, Rng, Species } from '../sim/types';
import type { BondMoment, ChatIntent, Choice, Moment, TeachMoment, Utterance, Voice } from '../brain/types';
import { emptyMemory, normalizeMemory, sayFact, sayFromPool, sayLine, type SayMemory } from '../brain/say';
import { TALK, decide, initialTalk, normalizeTalk, react, type Reaction, type TalkState, type Volunteer } from '../brain/talk';
export type { Volunteer };
import {
  MAX_REPLY_CHARS,
  WRITTEN_SHARE,
  addSpend,
  buildLinePrompt,
  buildReplyPrompt,
  canSpend,
  cleanLine,
  type LinePrompt,
  type Spend,
} from '../brain/writer';
import { BOND_WORDS, bondEvent, bondLevel, bondNow, bondPerks, emptyBond, normalizeBond, type Bond, type BondEvent } from '../brain/bond';
import { clearMood, converse, emptyChat, moodToAsk, normalizeChat, withExchange, type ChatState, type Say } from '../brain/chat';
import type { Profile } from '../brain/profile';
import { understand, type Known } from '../brain/understand';

/** What the controller keeps between launches (brain.json, one per pet). */
export interface TalkMemory {
  memory: SayMemory;
  talk: TalkState;
  spend: Spend | null;
  bond: Bond;
  chat: ChatState;
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
  /** What the pets know about you, and a way to change it (src/app/profile.ts). */
  profile(): Profile;
  setProfile(p: Profile): void;
  /** Teams and interests it can recognise. */
  known(): Known;
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
  /** You typed something to the pet. */
  chat(text: string): void;
  /** You pressed one of the buttons under a question it asked. */
  choose(choice: Choice): void;
  /** Something that counts for the bond happened (a meal, a knock, the feeder filled). */
  bondEvent(ev: BondEvent): void;
  /** The bond as of now. */
  bond(): Bond;
  /** Dev panel and harness: set the bond's points. */
  setBondPoints(points: number): void;
  /** "Forget me": what you said in chat goes too (the bond stays: it is the pet's). */
  forgetChat(): void;
  /** Say a thought about you now, if the bond allows and there is something to say (harness stills). */
  speakPersonal(): boolean;
}

/** Local calendar day, "2026-10-31". */
export function dayKeyOf(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const WRITER_CHECK_MS = 60_000;
/** A hello may use your name (and a close friend's words) at least this often once the bond allows. */
const CLOSE_HELLO_SHARE = 0.6;
/** Knocks before the knocking becomes an inside joke. */
const KNOCK_JOKE_AFTER = 20;
/** Times you brought something up before it becomes an inside joke. */
const SHARED_JOKE_AFTER = 2;
/** Chat intents the library answers itself even when Claude is available: they are its jokes and its greetings. */
const LIBRARY_ONLY: ReadonlySet<ChatIntent> = new Set<ChatIntent>(['joke', 'hello', 'bye', 'thanks', 'name-ask']);
/** Moments too important to lose to the gap after another bubble: said late rather than never. */
const OWED: ReadonlySet<Reaction> = new Set<Reaction>(['hungry', 'starving']);

export function createTalk(env: TalkEnv): TalkController {
  const saved = env.load();
  const o = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {};
  let memory = normalizeMemory(o['memory']);
  let talk = normalizeTalk(o['talk'], env.now(), env.rng);
  let spend = normalizeSpend(o['spend']);
  let bond = normalizeBond(o['bond'], env.now());
  let chatState = normalizeChat(o['chat']);
  let wasPresent = false;
  let awaySince = env.now();
  let writing = false;
  let writerOk = false;
  let writerCheckedAt = Number.NEGATIVE_INFINITY;
  /** The last few things said, as text, for a written line to avoid. */
  let lastSaid: string[] = [];
  /** A hunger line still to say once the gap clears. */
  let owed: Reaction | null = null;

  function persist(): void {
    env.save({ memory, talk, spend, bond, chat: chatState });
  }

  function perks(): ReturnType<typeof bondPerks> {
    return bondPerks(bondLevel(bondNow(bond, env.now()).points));
  }

  /** `{you}` once the bond allows it and you have said your name. */
  function you(): string | undefined {
    const name = env.profile().name;
    return name !== null && perks().useName ? name : undefined;
  }

  function chatLine(
    group: 'chat' | 'teach' | 'bond',
    key: ChatIntent | TeachMoment | BondMoment,
    vars: Record<string, string | undefined> = {},
  ): Utterance | null {
    const { species, personality, name } = env.pet();
    const cv = env.voice(species)?.chat;
    if (!cv) return null;
    const lines =
      group === 'chat'
        ? cv.chat[personality][key as ChatIntent]
        : group === 'teach'
          ? cv.teach[personality][key as TeachMoment]
          : cv.bond[personality][key as BondMoment];
    const r = sayFromPool(lines ?? [], `${group}:${key}:${personality}`, 'chat', memory, env.rng, { name, ...vars });
    if (!r) return null;
    memory = r.memory;
    return r.utterance;
  }

  function interestLabel(id: string): string | undefined {
    const known = env.known().interests.find((i) => i.id === id);
    if (known) return known.label;
    return env.profile().own.includes(id) ? id : undefined;
  }

  function teamNickname(id: string): string | undefined {
    return env.known().teams.find((t) => t.id === id)?.nickname;
  }

  function pickOne<T>(xs: readonly T[]): T | undefined {
    return xs.length === 0 ? undefined : xs[Math.min(xs.length - 1, Math.floor(env.rng() * xs.length))];
  }

  /** A thought about you, if the bond allows and it knows something to say. */
  function personalThought(): Utterance | null {
    const pk = perks();
    const p = env.profile();
    const options: (() => Utterance | null)[] = [];
    const yourName = you();
    if (yourName !== undefined) options.push(() => chatLine('bond', 'thought-you', { you: yourName }));
    if (pk.remembers) {
      const likes = [...p.interests, ...p.own];
      if (likes.length > 0) options.push(() => chatLine('bond', 'thought-interest', { interest: interestLabel(pickOne(likes)!) }));
      if (p.teams.length > 0) options.push(() => chatLine('bond', 'thought-team', { team: teamNickname(pickOne(p.teams)!) }));
    }
    if (pk.insideJokes) {
      if (bond.knocks >= KNOCK_JOKE_AFTER) options.push(() => chatLine('bond', 'joke-knock'));
      const shared = Object.entries(chatState.mentions).filter(([id, n]) => n >= SHARED_JOKE_AFTER && interestLabel(id) !== undefined);
      if (shared.length > 0) options.push(() => chatLine('bond', 'joke-shared', { interest: interestLabel(pickOne(shared)![0]) }));
    }
    const pick = pickOne(options);
    return pick ? pick() : null;
  }

  /** Hello when you come back: how you were feeling last time, or your name, once you are close. */
  function closeHello(): Utterance | null {
    if (!perks().remembers) return null;
    if (moodToAsk(chatState, env.now())) {
      chatState = clearMood(chatState);
      return chatLine('bond', 'mood-check');
    }
    const yourName = you();
    if (yourName !== undefined && env.rng() < CLOSE_HELLO_SHARE) return chatLine('bond', 'visit-close', { you: yourName });
    return null;
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
    if (v === 'visit' || v === 'welcome-back' || v === 'morning') {
      const u = closeHello();
      if (u) {
        say(u);
        return;
      }
    }
    if (v === 'thought' && env.rng() < perks().personalShare) {
      const u = personalThought();
      if (u) {
        say(u);
        return;
      }
    }
    if (v === 'thought' && env.writer && writerOk && !writing && canSpend(spend, dayKeyOf(env.now()), env.dailyCapUsd()) && env.rng() < WRITTEN_SHARE) {
      writtenThought();
      return;
    }
    const u = libraryLine(v);
    if (u) say(u);
  }

  /** A reply in chat goes up straight away: you asked. It still counts as the pet having spoken. */
  function reply(u: Utterance, youText: string, choices?: readonly Choice[]): void {
    if (!env.pet().alive) return;
    const out: Utterance = choices && choices.length > 0 ? { ...u, kind: 'chat', choices } : { ...u, kind: u.kind === 'fact' ? 'fact' : 'chat' };
    talk = { ...talk, lastSpokeAt: env.now() };
    lastSaid = [...lastSaid, out.text].slice(-6);
    chatState = withExchange(chatState, youText, out.text);
    env.show(out);
    persist();
  }

  /** What the pet knows that this reply is about, for Claude: only what you just mentioned. */
  function aboutForReply(text: string): string[] {
    const u = understand(text, env.known());
    const p = env.profile();
    const out: string[] = [];
    for (const m of u.teams) {
      for (const id of m.ids) {
        const t = env.known().teams.find((k) => k.id === id);
        if (t && p.teams.includes(id)) out.push(`the person follows the ${t.display}`);
      }
    }
    for (const id of u.interests) if (p.interests.includes(id)) out.push(`the person likes ${interestLabel(id) ?? id}`);
    return out;
  }

  function writtenReply(intent: ChatIntent, text: string): void {
    const writer = env.writer;
    if (!writer) return;
    writing = true;
    const { species, personality, name } = env.pet();
    const prompt = buildReplyPrompt({
      species,
      personality,
      name,
      you: you() ?? null,
      bond: BOND_WORDS[bondLevel(bondNow(bond, env.now()).points)],
      about: aboutForReply(text),
      recent: chatState.recent,
      message: text,
    });
    const day = dayKeyOf(env.now());
    const fallback = (): void => {
      const u = chatLine('chat', intent);
      if (u) reply(u, text);
    };
    writer
      .write(prompt)
      .then(
        (r) => {
          spend = addSpend(spend, day, r.usd);
          const line = r.text !== null ? cleanLine(r.text, MAX_REPLY_CHARS) : null;
          if (line !== null) reply({ id: `written:${env.now()}`, text: line, kind: 'chat' }, text);
          else fallback();
        },
        fallback,
      )
      .finally(() => {
        writing = false;
        persist();
      });
  }

  function speakSay(s: Say, text: string): void {
    if (s.kind === 'fact') {
      const u = fact();
      if (u) reply(u, text);
      return;
    }
    if (s.kind === 'teach') {
      const vars: Record<string, string> = { ...s.vars };
      const u = chatLine('teach', s.moment, vars);
      if (u) reply(u, text, s.choices);
      return;
    }
    const canWrite = env.writer && writerOk && !writing && canSpend(spend, dayKeyOf(env.now()), env.dailyCapUsd());
    if (canWrite && !LIBRARY_ONLY.has(s.intent)) {
      writtenReply(s.intent, text);
      return;
    }
    const u = chatLine('chat', s.intent);
    if (u) reply(u, text);
  }

  function converseAndReply(u: ReturnType<typeof understand>, choice: string | null, text: string): void {
    const now = env.now();
    const before = env.profile();
    const r = converse(chatState, u, choice, before, env.known(), now, text);
    chatState = r.state;
    if (r.profile !== before) env.setProfile(r.profile);
    bond = bondEvent(bond, r.told ? 'told' : 'chat', now, dayKeyOf(now));
    speakSay(r.say, text);
    persist();
  }

  return {
    tick() {
      checkWriter();
      const now = env.now();
      // A visit, for the bond: you came back after a few minutes away.
      const present = env.present();
      if (present && !wasPresent && now - awaySince >= TALK.VISIT_AWAY_MS) bond = bondEvent(bond, 'visit', now, dayKeyOf(now));
      if (!present && wasPresent) awaySince = now;
      wasPresent = present;
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
      bond = emptyBond(env.now());
      chatState = emptyChat();
      persist();
    },
    snapshot() {
      return { memory, talk, spend, bond, chat: chatState };
    },
    chat(text) {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      converseAndReply(understand(trimmed, env.known()), null, trimmed);
    },
    choose(choice) {
      converseAndReply(understand(choice.label, env.known()), choice.value, choice.label);
    },
    bondEvent(ev) {
      bond = bondEvent(bond, ev, env.now(), dayKeyOf(env.now()));
      persist();
    },
    bond: () => bondNow(bond, env.now()),
    setBondPoints(points) {
      const now = env.now();
      bond = { ...bondNow(bond, now), points: Math.max(0, Math.min(100, points)), caredAt: now };
      persist();
    },
    forgetChat() {
      chatState = emptyChat();
      persist();
    },
    speakPersonal() {
      const u = personalThought();
      if (u) say(u);
      persist();
      return u !== null;
    },
  };
}

function normalizeSpend(v: unknown): Spend | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  return typeof o['day'] === 'string' && typeof o['usd'] === 'number' && Number.isFinite(o['usd']) ? { day: o['day'], usd: o['usd'] } : null;
}
