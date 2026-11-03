// The world coming into the bowl (AFTER-BAKEOFF Step F), as the app runs it: fetch your teams'
// scoreboards and some happy news on a schedule, remember what the pet has said, and hand the talk
// controller (./talk.ts) something to say. Never makes anything up: a game or a headline exists here
// only because a fetch returned it, and when a fetch fails the pet simply says nothing about it.
// Everything it touches comes in through `WorldEnv`, so it runs the same in the app, the browser and tests.

import type { Rng } from '../sim/types';
import type { WorldMoment } from '../brain/types';
import type { Interest } from '../brain/interests';
import type { League, Team } from '../brain/teams';
import type { Profile } from '../brain/profile';
import { moodNow, normalizeSports, parseScoreboard, scoreboardUrl, sportsStep, type Game, type SportsState } from '../brain/sports';
import { HAPPY_FEEDS, interestFeedUrl, normalizeNews, parseFeed, pickStory, toldStory, type NewsState, type Story } from '../brain/news';

/** Something to say about the world: a kind of line, the facts that fill it, and where it came from. */
export interface WorldSay {
  moment: WorldMoment;
  vars: Record<string, string>;
  more?: { label: string; url: string };
  /** What `done` marks as said. */
  key: string;
}

export interface WorldEnv {
  now(): number;
  rng: Rng;
  fetch(url: string): Promise<string>;
  profile(): Profile;
  leagues: readonly League[];
  teams: readonly Team[];
  interests: readonly Interest[];
  /** Serious news (politics) allowed. */
  serious(): boolean;
  load(): unknown;
  save(doc: unknown): void;
}

export interface World {
  /** Call every few seconds: fetches when due. */
  tick(): void;
  /** A game-day or a result that should be said soon (until `done`). */
  due(): WorldSay | null;
  done(say: WorldSay): void;
  /** A story to share now, if there is a fresh one. */
  news(interestFirst?: boolean): WorldSay | null;
  /** A line about how your team did, while the mood lasts. */
  mood(): WorldSay | null;
  /** You asked how your team is doing: the latest from a fresh scoreboard. */
  ask(teamIds: readonly string[]): Promise<WorldSay[]>;
  /** -1..1 for the fish's body: a win celebrates, a loss sulks. */
  cheer(): number;
  /** Fetch now (harness, and when the profile changes). */
  refresh(what: 'sports' | 'news' | 'all'): Promise<void>;
  /** Dev panel and harness: pretend a game of your first team just ended. Labelled a test everywhere. */
  forceResult(result: 'won' | 'lost', us: number, them: number): boolean;
  snapshot(): { sports: SportsState; news: NewsState; games: readonly Game[]; stories: number };
}

const MINUTE = 60_000;
export const WORLD = Object.freeze({
  SPORTS_EVERY_MS: 10 * MINUTE,
  /** While one of your games is on, or about to start. */
  SPORTS_LIVE_EVERY_MS: 3 * MINUTE,
  NEWS_EVERY_MS: 3 * 60 * MINUTE,
  /** The first news fetch, a little after launch. */
  NEWS_FIRST_MS: 1 * MINUTE,
  /** An answer to "how are they doing" can use a scoreboard this old. */
  ASK_FRESH_MS: 2 * MINUTE,
  /** Mood lines at most this often. */
  MOOD_LINE_GAP_MS: 40 * MINUTE,
  STORIES_KEPT: 150,
});

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clock(t: number): string {
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

export function createWorld(env: WorldEnv): World {
  const saved = env.load();
  const o = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {};
  let sports = normalizeSports(o['sports'], env.now());
  let news = normalizeNews(o['news']);
  let feedIdx = typeof o['feedIdx'] === 'number' ? o['feedIdx'] : 0;
  let interestIdx = 0;
  let games: Game[] = [];
  let gamesAt = 0;
  let stories: (Story & { interest?: string })[] = [];
  let nextSports = env.now() + 5_000;
  let nextNews = env.now() + WORLD.NEWS_FIRST_MS;
  let fetchingSports = false;
  let fetchingNews = false;
  let lastMoodLine = Number.NEGATIVE_INFINITY;
  const due: WorldSay[] = [];

  function persist(): void {
    env.save({ version: 1, sports, news, feedIdx });
  }

  const nick = (id: string): string => env.teams.find((t) => t.id === id)?.nickname ?? id;

  function sayGame(kind: 'game-day' | 'final', g: Game): WorldSay {
    const vars: Record<string, string> = { team: nick(g.teamId), opponent: g.opponent };
    if (kind === 'game-day') return { moment: 'game-day', vars: { ...vars, time: clock(g.start) }, key: `hype:${g.id}:${g.teamId}` };
    return { moment: g.result ?? 'tied', vars: { ...vars, score: `${g.us ?? 0}-${g.them ?? 0}` }, key: `final:${g.id}:${g.teamId}` };
  }

  function followed(): Set<string> {
    return new Set(env.profile().teams);
  }

  async function fetchSports(): Promise<void> {
    const follow = followed();
    if (follow.size === 0 || fetchingSports) return;
    fetchingSports = true;
    try {
      const leagues = env.leagues.filter((l) => [...follow].some((id) => id.startsWith(`${l.id}:`)));
      const fresh: Game[] = [];
      for (const l of leagues) {
        try {
          fresh.push(...parseScoreboard(JSON.parse(await env.fetch(scoreboardUrl(l))), l.id, env.teams, follow));
        } catch {
          // Unreachable or unreadable: nothing to say about that league this time.
        }
      }
      games = fresh;
      gamesAt = env.now();
      const r = sportsStep(sports, games, env.now(), dayKey(env.now()));
      sports = r.state;
      for (const e of r.events) {
        due.push(sayGame(e.kind, e.game));
        if (e.kind === 'final') lastMoodLine = Number.NEGATIVE_INFINITY;
      }
      persist();
    } finally {
      fetchingSports = false;
    }
  }

  async function fetchNews(): Promise<void> {
    if (fetchingNews) return;
    fetchingNews = true;
    try {
      const feed = HAPPY_FEEDS[feedIdx % HAPPY_FEEDS.length]!;
      feedIdx += 1;
      const got: (Story & { interest?: string })[] = [];
      try {
        got.push(...parseFeed(await env.fetch(feed.url), feed.source));
      } catch {
        // No news from this one today.
      }
      const p = env.profile();
      const likes = [...p.interests.map((id) => env.interests.find((i) => i.id === id)?.label ?? ''), ...p.own].filter((l) => l !== '');
      if (likes.length > 0) {
        const label = likes[interestIdx % likes.length]!;
        interestIdx += 1;
        try {
          got.push(...parseFeed(await env.fetch(interestFeedUrl(label)), 'Google News').map((s) => ({ ...s, interest: label })));
        } catch {
          // Nothing about that one this time.
        }
      }
      const seen = new Set(stories.map((s) => s.link));
      stories = [...got.filter((s) => !seen.has(s.link)), ...stories].slice(0, WORLD.STORIES_KEPT);
      persist();
    } finally {
      fetchingNews = false;
    }
  }

  function liveSoon(): boolean {
    const now = env.now();
    return games.some((g) => g.state === 'in' || (g.state === 'pre' && g.start - now < 30 * MINUTE));
  }

  return {
    tick() {
      const now = env.now();
      if (now >= nextSports) {
        nextSports = now + (liveSoon() ? WORLD.SPORTS_LIVE_EVERY_MS : WORLD.SPORTS_EVERY_MS);
        void fetchSports();
      }
      if (now >= nextNews) {
        nextNews = now + WORLD.NEWS_EVERY_MS;
        void fetchNews();
      }
    },
    due: () => due[0] ?? null,
    done(say) {
      const i = due.findIndex((d) => d.key === say.key);
      if (i >= 0) due.splice(i, 1);
      const story = stories.find((s) => `news:${s.link}` === say.key);
      if (story) {
        news = toldStory(news, story, env.now());
        persist();
      }
    },
    news(interestFirst = false) {
      const pool = interestFirst ? stories.filter((s) => s.interest !== undefined) : stories;
      const s = pickStory(pool.length > 0 ? pool : stories, news, env.now(), env.rng, { serious: env.serious() });
      if (!s) return null;
      const more = { label: s.source, url: s.link };
      const story = stories.find((x) => x.link === s.link);
      if (story?.interest !== undefined) return { moment: 'news-interest', vars: { interest: story.interest, headline: s.title }, more, key: `news:${s.link}` };
      return { moment: 'news', vars: { headline: s.title }, more, key: `news:${s.link}` };
    },
    mood() {
      const m = moodNow(sports, env.now());
      if (!m || m.result === 'tied' || env.now() - lastMoodLine < WORLD.MOOD_LINE_GAP_MS) return null;
      lastMoodLine = env.now();
      return { moment: m.result === 'won' ? 'still-happy' : 'mope', vars: { team: nick(m.teamId) }, key: `mood:${m.teamId}:${env.now()}` };
    },
    async ask(teamIds) {
      const ids = teamIds.length > 0 ? teamIds : env.profile().teams;
      if (ids.length === 0) return [];
      if (env.now() - gamesAt > WORLD.ASK_FRESH_MS) await fetchSports();
      const out: WorldSay[] = [];
      for (const id of ids.slice(0, 2)) {
        const today = games.filter((g) => g.teamId === id && dayKey(g.start) === dayKey(env.now()));
        const g = today.find((x) => x.state === 'in') ?? today.find((x) => x.state === 'post') ?? today.find((x) => x.state === 'pre');
        if (!g) out.push({ moment: 'no-game', vars: { team: nick(id) }, key: `ask:${id}:${env.now()}` });
        else if (g.state === 'in') out.push({ moment: 'live', vars: { team: nick(id), opponent: g.opponent, score: `${g.us ?? 0}-${g.them ?? 0}` }, key: `ask:${g.id}:${env.now()}` });
        else out.push(sayGame(g.state === 'pre' ? 'game-day' : 'final', g));
      }
      return out;
    },
    cheer() {
      const m = moodNow(sports, env.now());
      return m === null ? 0 : m.result === 'won' ? 1 : m.result === 'lost' ? -1 : 0;
    },
    async refresh(what) {
      if (what !== 'news') await fetchSports();
      if (what !== 'sports') await fetchNews();
    },
    forceResult(result, us, them) {
      const teamId = env.profile().teams[0];
      if (teamId === undefined) return false;
      const league = teamId.split(':')[0];
      const rivals = env.teams.filter((t) => t.league === league && t.id !== teamId);
      const opp = rivals[Math.floor(env.rng() * rivals.length)];
      const g: Game = {
        id: `test-${env.now()}`,
        teamId,
        start: env.now() - 3 * 3_600_000,
        state: 'post',
        opponent: opp?.nickname ?? 'Visitors',
        us,
        them,
        detail: 'Final (test)',
        result,
      };
      const r = sportsStep(sports, [g], env.now(), dayKey(env.now()));
      sports = r.state;
      for (const e of r.events) due.push(sayGame(e.kind, e.game));
      // A new result is a new mood: its first line need not wait for the last mood's gap.
      lastMoodLine = Number.NEGATIVE_INFINITY;
      persist();
      return true;
    },
    snapshot: () => ({ sports, news, games, stories: stories.length }),
  };
}
