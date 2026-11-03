// The bond (AFTER-BAKEOFF Step E.3): how close a pet is to you. It grows with feeding, visits and
// chats, a little each day however much you click, and fades slowly once you stop coming by. Each
// level unlocks something the pet does: your name, swimming to the glass when you come back,
// remembering what you told it, inside jokes. Shown lightly, in words, never as a score.
// Pure; timestamps in. One per pet, kept with the rest of its brain.

export const BOND = Object.freeze({
  MAX: 100,
  /** Points to reach levels 1, 2 and 3. */
  LEVELS: [15, 40, 75] as const,
  /** Most a single day can add. */
  DAILY_GAIN_CAP: 8,
  GAIN: Object.freeze({ fed: 2, visit: 1, chat: 1, told: 2, feeder: 1 }),
  /** Nobody has fed, visited or talked for this long, and the bond starts to fade. */
  GRACE_MS: 24 * 3_600_000,
  FADE_PER_DAY: 5,
  /** A close friend swims to the glass when you come back after this long away (strangers wait two hours). */
  CLOSE_GREET_AWAY_MS: 3 * 60_000,
});

const DAY_MS = 24 * 3_600_000;

/** What happened between you: care, or (for the inside joke) a knock on the glass. */
export type BondEvent = 'fed' | 'visit' | 'chat' | 'told' | 'feeder' | 'knock';

export interface Bond {
  points: number;
  /** When `points` was last brought up to date (fading is applied from here). */
  at: number;
  /** The last time you fed, visited or talked: neglect counts from here. */
  caredAt: number;
  /** The local day the gains below were counted on. */
  day: string;
  gainedToday: number;
  /** Knocks on the glass, ever. */
  knocks: number;
}

export type BondLevel = 0 | 1 | 2 | 3;

/** How the card puts it. */
export const BOND_WORDS: Readonly<Record<BondLevel, string>> = {
  0: 'just met',
  1: 'getting comfy',
  2: 'good friends',
  3: 'best friends',
};

export interface BondPerks {
  /** Says your name now and then. */
  useName: boolean;
  /** Swims to the glass when you come back. */
  swimToGlass: boolean;
  /** Brings up what you told it: your interests, your team, how you were feeling. */
  remembers: boolean;
  /** Inside jokes. */
  insideJokes: boolean;
  /** Share of its volunteered thoughts that are about you. */
  personalShare: number;
}

export function emptyBond(now: number): Bond {
  return { points: 0, at: now, caredAt: now, day: '', gainedToday: 0, knocks: 0 };
}

export function bondLevel(points: number): BondLevel {
  const [one, two, three] = BOND.LEVELS;
  if (points >= three) return 3;
  if (points >= two) return 2;
  if (points >= one) return 1;
  return 0;
}

export function bondPerks(level: BondLevel): BondPerks {
  return {
    useName: level >= 1,
    swimToGlass: level >= 2,
    remembers: level >= 2,
    insideJokes: level >= 3,
    personalShare: [0, 0.15, 0.25, 0.35][level]!,
  };
}

/** Bring the bond up to `now`: after a day without care it fades, steadily, to nothing at worst. */
export function bondNow(b: Bond, now: number): Bond {
  if (now <= b.at) return b;
  const fadeFrom = Math.max(b.at, b.caredAt + BOND.GRACE_MS);
  const lost = now > fadeFrom ? (BOND.FADE_PER_DAY * (now - fadeFrom)) / DAY_MS : 0;
  return { ...b, points: Math.max(0, b.points - lost), at: now };
}

export function bondEvent(b0: Bond, ev: BondEvent, now: number, dayKey: string): Bond {
  const b = bondNow(b0, now);
  if (ev === 'knock') return { ...b, knocks: b.knocks + 1 };
  const gainedToday = b.day === dayKey ? b.gainedToday : 0;
  const gain = Math.max(0, Math.min(BOND.GAIN[ev], BOND.DAILY_GAIN_CAP - gainedToday));
  return {
    ...b,
    points: Math.min(BOND.MAX, b.points + gain),
    caredAt: Math.max(b.caredAt, now),
    day: dayKey,
    gainedToday: gainedToday + gain,
  };
}

/** Parse a saved bond. Out-of-range points are clamped; times in the future are not believed. */
export function normalizeBond(v: unknown, now: number): Bond {
  if (typeof v !== 'object' || v === null) return emptyBond(now);
  const o = v as Record<string, unknown>;
  const num = (k: string, d: number): number => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : d);
  return {
    points: Math.min(BOND.MAX, Math.max(0, num('points', 0))),
    at: Math.min(num('at', now), now),
    caredAt: Math.min(num('caredAt', now), now),
    day: typeof o['day'] === 'string' ? o['day'] : '',
    gainedToday: Math.max(0, num('gainedToday', 0)),
    knocks: Math.max(0, Math.floor(num('knocks', 0))),
  };
}
