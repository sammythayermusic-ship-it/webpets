// Milestones worth sharing (AFTER-BAKEOFF Step F2.3): birthdays, a number of meals, a bond level
// reached, your team's win. The pet marks each once, with a line and a "Share this" button. Pure.
// A pet that already passed some when this arrived starts with them marked, so nobody gets a flood.

import { BOND_WORDS, type BondLevel } from './bond';
import type { MilestoneMoment } from './types';

const DAY = 86_400_000;

/** Birthdays: a day, a week, then months, then years. */
export const BIRTHDAYS: readonly { key: string; afterMs: number; age: string }[] = [
  { key: 'age:1d', afterMs: DAY, age: 'one day' },
  { key: 'age:1w', afterMs: 7 * DAY, age: 'one week' },
  { key: 'age:1m', afterMs: 30 * DAY, age: 'one month' },
  { key: 'age:2m', afterMs: 60 * DAY, age: 'two months' },
  { key: 'age:3m', afterMs: 91 * DAY, age: 'three months' },
  { key: 'age:6m', afterMs: 182 * DAY, age: 'six months' },
  { key: 'age:1y', afterMs: 365 * DAY, age: 'one year' },
  { key: 'age:2y', afterMs: 730 * DAY, age: 'two years' },
  { key: 'age:3y', afterMs: 1095 * DAY, age: 'three years' },
];

export const MEAL_COUNTS: readonly number[] = [10, 50, 100, 250, 500, 1000, 2000];

export interface Milestone {
  key: string;
  moment: MilestoneMoment;
  vars: Record<string, string>;
}

export interface MilestoneState {
  reached: readonly string[];
}

export interface MilestoneFacts {
  bornAt: number;
  now: number;
  meals: number;
  bond: BondLevel;
}

function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** Every milestone these facts have passed, oldest first within each kind. */
function passed(f: MilestoneFacts): Milestone[] {
  const out: Milestone[] = [];
  for (const b of BIRTHDAYS) if (f.now - f.bornAt >= b.afterMs) out.push({ key: b.key, moment: 'birthday', vars: { age: b.age } });
  for (const n of MEAL_COUNTS) if (f.meals >= n) out.push({ key: `meals:${n}`, moment: 'meals', vars: { count: count(n) } });
  for (const l of [1, 2, 3] as const) if (f.bond >= l) out.push({ key: `bond:${l}`, moment: 'bond', vars: { bond: BOND_WORDS[l] } });
  return out;
}

/**
 * New milestones to mark: of each kind, only the newest just passed (two birthdays crossed while the
 * app was closed make one birthday line); everything passed is remembered.
 */
export function milestonesDue(s: MilestoneState, f: MilestoneFacts): { due: Milestone[]; state: MilestoneState } {
  const reached = new Set(s.reached);
  const fresh = passed(f).filter((m) => !reached.has(m.key));
  const newest = new Map<MilestoneMoment, Milestone>();
  for (const m of fresh) newest.set(m.moment, m);
  return { due: [...newest.values()], state: { reached: [...s.reached, ...fresh.map((m) => m.key)] } };
}

/** Your team won: a moment to share. Once per game. */
export function winMilestone(s: MilestoneState, gameKey: string, team: string, score: string): { due: Milestone | null; state: MilestoneState } {
  const key = `win:${gameKey}`;
  if (s.reached.includes(key)) return { due: null, state: s };
  // Wins pile up over seasons: keep the last fifty, and everything else.
  const wins = [...s.reached.filter((k) => k.startsWith('win:')), key].slice(-50);
  const reached = [...s.reached.filter((k) => !k.startsWith('win:')), ...wins];
  return { due: { key, moment: 'big-win', vars: { team, score } }, state: { reached } };
}

/**
 * Saved milestones. With nothing saved, everything already passed counts as marked: a pet that was
 * a month old when this arrived does not announce its one-day birthday.
 */
export function normalizeMilestones(v: unknown, f: MilestoneFacts): MilestoneState {
  const r = (v as { reached?: unknown } | null)?.reached;
  if (!Array.isArray(r)) return { reached: passed(f).map((m) => m.key) };
  return { reached: r.filter((x): x is string => typeof x === 'string') };
}
