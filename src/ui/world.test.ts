import { describe, expect, it } from 'vitest';
import { emptyProfile, type Profile } from '../brain/profile';
import type { League, Team } from '../brain/teams';
import { createWorld, WORLD, type WorldEnv } from './world';

const NBA: League = { id: 'nba', name: 'National Basketball Association', short: 'NBA', sport: 'basketball', espn: 'basketball/nba' };
const TEAMS: Team[] = [
  { id: 'nba:2', league: 'nba', espnId: '2', abbr: 'BOS', location: 'Boston', nickname: 'Celtics', display: 'Boston Celtics', aliases: [] },
  { id: 'nba:20', league: 'nba', espnId: '20', abbr: 'PHI', location: 'Philadelphia', nickname: '76ers', display: 'Philadelphia 76ers', aliases: [] },
];
const start = new Date(2026, 10, 3, 9, 30).getTime();

function scoreboard(state: 'pre' | 'in' | 'post', us: number | null, them: number | null): string {
  const side = (id: string, name: string, score: number | null, winner?: boolean) => ({
    team: { id, shortDisplayName: name },
    ...(score !== null ? { score: String(score) } : {}),
    ...(winner !== undefined ? { winner } : {}),
  });
  return JSON.stringify({
    events: [
      {
        id: 'g1',
        date: new Date(new Date(2026, 10, 3, 19, 30).getTime()).toISOString(),
        status: { type: { state, shortDetail: 'x' } },
        competitions: [{ competitors: [side('2', 'Celtics', us, state === 'post' ? (us ?? 0) > (them ?? 0) : undefined), side('20', '76ers', them)] }],
      },
    ],
  });
}

const FEED = `<rss><channel><item><title>A town plants ten thousand trees</title><link>https://www.goodnewsnetwork.org/trees/</link></item></channel></rss>`;

function harness(profile: Profile) {
  let t = start;
  let board = scoreboard('pre', null, null);
  const fetched: string[] = [];
  let saved: unknown = null;
  const env: WorldEnv = {
    now: () => t,
    rng: () => 0,
    fetch: async (url) => {
      fetched.push(url);
      if (url.includes('espn')) return board;
      if (url.includes('goodnewsnetwork')) return FEED;
      throw new Error('offline');
    },
    profile: () => profile,
    leagues: [NBA],
    teams: TEAMS,
    interests: [],
    serious: () => false,
    load: () => null,
    save: (d) => (saved = d),
  };
  const w = createWorld(env);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return {
    w,
    fetched,
    saved: () => saved,
    async advance(ms: number) {
      t += ms;
      w.tick();
      await flush();
      await flush();
    },
    setBoard(b: string) {
      board = b;
    },
  };
}

const fan = { ...emptyProfile(start), teams: ['nba:2'] };

describe('the world, in the app', () => {
  it('hypes game day, then tells the result, from the scoreboards it fetched', async () => {
    const h = harness(fan);
    await h.advance(10_000);
    expect(h.fetched.some((u) => u.includes('basketball/nba/scoreboard'))).toBe(true);
    const hype = h.w.due()!;
    expect(hype).toMatchObject({ moment: 'game-day', vars: { team: 'Celtics', opponent: '76ers', time: '7:30 pm' } });
    h.w.done(hype);
    expect(h.w.due()).toBeNull();
    h.setBoard(scoreboard('post', 117, 112));
    await h.advance(WORLD.SPORTS_EVERY_MS);
    expect(h.w.due()).toMatchObject({ moment: 'won', vars: { team: 'Celtics', opponent: '76ers', score: '117-112' } });
    expect(h.w.cheer()).toBe(1);
  });

  it('only fetches the leagues you follow, and nothing at all without a team', async () => {
    const h = harness(emptyProfile(start));
    await h.advance(20_000);
    expect(h.fetched.filter((u) => u.includes('espn'))).toEqual([]);
  });

  it('answers how your team is doing from a fresh scoreboard', async () => {
    const h = harness(fan);
    h.setBoard(scoreboard('in', 54, 50));
    const [say] = await h.w.ask(['nba:2']);
    expect(say).toMatchObject({ moment: 'live', vars: { team: 'Celtics', score: '54-50' } });
    h.setBoard(JSON.stringify({ events: [] }));
    await h.advance(WORLD.ASK_FRESH_MS + 1);
    expect((await h.w.ask(['nba:2']))[0]).toMatchObject({ moment: 'no-game', vars: { team: 'Celtics' } });
  });

  it('shares a happy headline it fetched, with its source, once', async () => {
    const h = harness(fan);
    await h.advance(WORLD.NEWS_FIRST_MS + 1);
    const n = h.w.news()!;
    expect(n).toMatchObject({ moment: 'news', vars: { headline: 'A town plants ten thousand trees' }, more: { label: 'Good News Network', url: 'https://www.goodnewsnetwork.org/trees/' } });
    h.w.done(n);
    expect(h.w.news()).toBeNull();
  });

  it('takes turns: a feel-good story, then one about something you like', async () => {
    const h = harness({ ...fan, own: ['bird watching'] });
    await h.advance(WORLD.NEWS_FIRST_MS + 1);
    const first = h.w.news()!;
    h.w.done(first);
    expect(first.moment).toBe('news');
    // The interest feed is offline in this harness, so the next one falls back to what there is.
    expect(h.w.news()).toBeNull();
  });

  it('says nothing when the fetch fails', async () => {
    const h = harness(fan);
    h.setBoard('not json');
    await h.advance(10_000);
    expect(h.w.due()).toBeNull();
    expect(h.w.cheer()).toBe(0);
  });

  it('a test result from the dev panel moves the mood like a real one', () => {
    const h = harness(fan);
    expect(h.w.forceResult('lost', 98, 104)).toBe(true);
    expect(h.w.due()).toMatchObject({ moment: 'lost', vars: { team: 'Celtics', score: '98-104' } });
    expect(h.w.cheer()).toBe(-1);
    expect(h.w.mood()).toMatchObject({ moment: 'mope', vars: { team: 'Celtics' } });
    expect(h.w.mood()).toBeNull();
  });
});
