// Your teams' games (AFTER-BAKEOFF Step F.1): read ESPN's public scoreboard, and decide what the pet
// says about it: game-day hype, the result, a score if you ask. A win makes it happy the rest of the
// day; a loss makes it sad that day and the next morning, then it bounces back. Pure. It only ever
// talks about games in a scoreboard the app actually fetched; nothing here invents a score.

import type { League, LeagueId, Team } from './teams';

export const SPORTS = Object.freeze({
  /** Game-day hype from this hour, or from this long before the start if that is earlier. */
  HYPE_FROM_HOUR: 9,
  HYPE_BEFORE_MS: 6 * 3_600_000,
  /** A final is news for this long after the game started; older and it is not mentioned. */
  FINAL_FRESH_MS: 18 * 3_600_000,
  /** A loss is moped about until this hour the next day. */
  MOPE_UNTIL_HOUR: 12,
  /** Game ids remembered as said. */
  REMEMBER_GAMES: 200,
});

export type GameResult = 'won' | 'lost' | 'tied';

/** One game, from your team's side. */
export interface Game {
  id: string;
  teamId: string;
  start: number;
  state: 'pre' | 'in' | 'post';
  opponent: string;
  /** Your team's score, then theirs; null before it starts. */
  us: number | null;
  them: number | null;
  /** ESPN's short status: "7:30 PM", "Q3 4:12", "Final". */
  detail: string;
  result: GameResult | null;
}

export type SportsEvent = { kind: 'game-day'; game: Game } | { kind: 'final'; game: Game };

export interface SportsState {
  /** What has been said about each game: hype, the result. */
  said: Readonly<Record<string, { hype?: true; final?: true; at: number }>>;
  /** The latest result that sets the mood, and until when. */
  mood: { teamId: string; result: GameResult; until: number } | null;
}

export function emptySports(): SportsState {
  return { said: {}, mood: null };
}

export function scoreboardUrl(league: League): string {
  return `https://site.api.espn.com/apis/site/v2/sports/${league.espn}/scoreboard`;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null;
}

/**
 * The games in one league's scoreboard that involve a team you follow (`follow` holds team ids),
 * each from that team's side. Anything malformed is skipped.
 */
export function parseScoreboard(json: unknown, league: LeagueId, teams: readonly Team[], follow: ReadonlySet<string>): Game[] {
  const events = (json as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];
  const out: Game[] = [];
  for (const e of events) {
    const id = str(e?.id);
    const start = Date.parse(str(e?.date) ?? '');
    const type = e?.status?.type;
    const state = type?.state;
    const comps = e?.competitions?.[0]?.competitors;
    if (id === null || !Number.isFinite(start) || (state !== 'pre' && state !== 'in' && state !== 'post') || !Array.isArray(comps) || comps.length !== 2) continue;
    const sides = comps.map((c: unknown) => {
      const o = c as { team?: { id?: unknown; shortDisplayName?: unknown; name?: unknown }; score?: unknown; winner?: unknown };
      const tid = str(o.team?.id);
      const score = str(o.score);
      return {
        teamId: tid === null ? null : `${league}:${tid}`,
        name: str(o.team?.shortDisplayName) ?? str(o.team?.name) ?? '',
        score: score !== null && score !== '' && Number.isFinite(Number(score)) ? Number(score) : null,
        winner: o.winner === true,
      };
    });
    for (let i = 0; i < 2; i++) {
      const me = sides[i]!;
      const them = sides[1 - i]!;
      if (me.teamId === null || !follow.has(me.teamId)) continue;
      const opponent = teams.find((t) => t.id === them.teamId)?.nickname ?? them.name;
      if (opponent === '') continue;
      const done = state === 'post' && me.score !== null && them.score !== null;
      const result: GameResult | null = !done ? null : me.winner ? 'won' : them.winner ? 'lost' : me.score! > them.score! ? 'won' : me.score! < them.score! ? 'lost' : 'tied';
      out.push({
        id,
        teamId: me.teamId,
        start,
        state,
        opponent,
        us: state === 'pre' ? null : me.score,
        them: state === 'pre' ? null : them.score,
        detail: str(type?.shortDetail) ?? str(type?.detail) ?? '',
        result,
      });
    }
  }
  return out;
}

function sameLocalDay(a: number, dayKey: string): boolean {
  const d = new Date(a);
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return k === dayKey;
}

function endOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0).getTime();
}

function noonNextDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, SPORTS.MOPE_UNTIL_HOUR, 0).getTime();
}

/** New things to say about these games now, once each; the mood follows the latest result. */
export function sportsStep(state: SportsState, games: readonly Game[], now: number, dayKey: string): { events: SportsEvent[]; state: SportsState } {
  const said = { ...state.said };
  let mood = state.mood;
  const events: SportsEvent[] = [];
  for (const g of [...games].sort((a, b) => a.start - b.start)) {
    const prev = said[g.id] ?? { at: now };
    if (g.state === 'pre' && !prev.hype && sameLocalDay(g.start, dayKey)) {
      const hour = new Date(now).getHours();
      if (hour >= SPORTS.HYPE_FROM_HOUR || g.start - now <= SPORTS.HYPE_BEFORE_MS) {
        events.push({ kind: 'game-day', game: g });
        said[g.id] = { ...prev, hype: true, at: now };
      }
    } else if (g.state === 'post' && g.result !== null && !prev.final) {
      said[g.id] = { ...prev, final: true, at: now };
      if (now - g.start <= SPORTS.FINAL_FRESH_MS) {
        events.push({ kind: 'final', game: g });
        if (g.result !== 'tied') mood = { teamId: g.teamId, result: g.result, until: g.result === 'won' ? endOfDay(now) : noonNextDay(now) };
      }
    }
  }
  return { events, state: { said: trim(said), mood } };
}

function trim(said: Record<string, { hype?: true; final?: true; at: number }>): SportsState['said'] {
  const entries = Object.entries(said);
  if (entries.length <= SPORTS.REMEMBER_GAMES) return said;
  return Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, SPORTS.REMEMBER_GAMES));
}

/** How your team's latest result makes the pet feel right now, if it still does. */
export function moodNow(s: SportsState, now: number): { teamId: string; result: GameResult } | null {
  return s.mood !== null && now < s.mood.until ? { teamId: s.mood.teamId, result: s.mood.result } : null;
}

/** Parse saved sports state; anything malformed starts fresh. */
export function normalizeSports(v: unknown, now: number): SportsState {
  if (typeof v !== 'object' || v === null) return emptySports();
  const o = v as Record<string, unknown>;
  const said: Record<string, { hype?: true; final?: true; at: number }> = {};
  if (typeof o['said'] === 'object' && o['said'] !== null) {
    for (const [k, x] of Object.entries(o['said'] as Record<string, unknown>)) {
      const r = x as { hype?: unknown; final?: unknown; at?: unknown } | null;
      if (!r || typeof r.at !== 'number') continue;
      said[k] = { ...(r.hype === true ? { hype: true as const } : {}), ...(r.final === true ? { final: true as const } : {}), at: Math.min(r.at, now) };
    }
  }
  const m = o['mood'] as { teamId?: unknown; result?: unknown; until?: unknown } | null | undefined;
  const result: GameResult | null = m?.result === 'won' ? 'won' : m?.result === 'lost' ? 'lost' : m?.result === 'tied' ? 'tied' : null;
  const mood = m && typeof m.teamId === 'string' && result !== null && typeof m.until === 'number' ? { teamId: m.teamId, result, until: m.until } : null;
  return { said: trim(said), mood };
}
