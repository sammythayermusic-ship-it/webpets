import { describe, expect, it } from 'vitest';
import type { Team } from './teams';
import {
  SPORTS,
  emptySports,
  moodNow,
  normalizeSports,
  parseScoreboard,
  scoreboardUrl,
  sportsStep,
  type Game,
} from './sports';

const team = (id: string, nickname: string): Team => ({
  id,
  league: id.split(':')[0] as Team['league'],
  espnId: id.split(':')[1]!,
  abbr: 'X',
  location: 'City',
  nickname,
  display: `City ${nickname}`,
  aliases: [],
});
const TEAMS = [team('nba:2', 'Celtics'), team('nba:20', '76ers'), team('mlb:2', 'Red Sox')];

/** A cut-down ESPN scoreboard, the shape the public site API returns. */
function board(events: { id: string; date: string; state: 'pre' | 'in' | 'post'; detail: string; home: [string, string, number | null, boolean?]; away: [string, string, number | null, boolean?] }[]): unknown {
  return {
    events: events.map((e) => ({
      id: e.id,
      date: e.date,
      status: { type: { state: e.state, completed: e.state === 'post', shortDetail: e.detail } },
      competitions: [
        {
          competitors: [e.home, e.away].map(([id, name, score, winner], i) => ({
            homeAway: i === 0 ? 'home' : 'away',
            team: { id, shortDisplayName: name, displayName: `City ${name}` },
            ...(score !== null ? { score: String(score) } : {}),
            ...(winner !== undefined ? { winner } : {}),
          })),
        },
      ],
    })),
  };
}

const T = new Date(2026, 10, 3, 10, 0).getTime(); // 10 am local
const DAY = '2026-11-03';
const at = (h: number, m = 0): number => new Date(2026, 10, 3, h, m).getTime();

describe('reading a scoreboard', () => {
  it('finds the games your teams play, from your side', () => {
    const json = board([
      { id: 'g1', date: new Date(at(19, 30)).toISOString(), state: 'pre', detail: '7:30 PM', home: ['2', 'Celtics', null], away: ['20', '76ers', null] },
      { id: 'g2', date: new Date(at(19)).toISOString(), state: 'pre', detail: '7:00 PM', home: ['5', 'Cavaliers', null], away: ['25', 'Thunder', null] },
    ]);
    const games = parseScoreboard(json, 'nba', TEAMS, new Set(['nba:2']));
    expect(games).toEqual([
      { id: 'g1', teamId: 'nba:2', start: at(19, 30), state: 'pre', opponent: '76ers', us: null, them: null, detail: '7:30 PM', result: null },
    ]);
  });

  it('reads a final as a win, a loss or a draw', () => {
    const json = board([
      { id: 'w', date: new Date(at(1)).toISOString(), state: 'post', detail: 'Final', home: ['2', 'Celtics', 117, true], away: ['20', '76ers', 112, false] },
    ]);
    expect(parseScoreboard(json, 'nba', TEAMS, new Set(['nba:2']))[0]).toMatchObject({ result: 'won', us: 117, them: 112 });
    expect(parseScoreboard(json, 'nba', TEAMS, new Set(['nba:20']))[0]).toMatchObject({ result: 'lost', us: 112, them: 117, opponent: 'Celtics' });
    const draw = board([{ id: 'd', date: new Date(at(1)).toISOString(), state: 'post', detail: 'FT', home: ['2', 'Celtics', 1], away: ['20', '76ers', 1] }]);
    expect(parseScoreboard(draw, 'nba', TEAMS, new Set(['nba:2']))[0]).toMatchObject({ result: 'tied' });
  });

  it('says nothing about a scoreboard it cannot read', () => {
    expect(parseScoreboard(null, 'nba', TEAMS, new Set(['nba:2']))).toEqual([]);
    expect(parseScoreboard({ events: [{ id: 1 }] }, 'nba', TEAMS, new Set(['nba:2']))).toEqual([]);
  });

  it('knows where to ask', () => {
    expect(scoreboardUrl({ id: 'nba', name: '', short: 'NBA', sport: 'basketball', espn: 'basketball/nba' })).toBe(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
    );
  });
});

describe('what the pet says about your games, and when', () => {
  const pre: Game = { id: 'g1', teamId: 'nba:2', start: at(19, 30), state: 'pre', opponent: '76ers', us: null, them: null, detail: '7:30 PM', result: null };

  it('hypes game day once, in the morning or once it is close', () => {
    const early = sportsStep(emptySports(), [pre], at(7), DAY);
    expect(early.events).toEqual([]);
    const s1 = sportsStep(emptySports(), [pre], T, DAY);
    expect(s1.events).toEqual([{ kind: 'game-day', game: pre }]);
    expect(sportsStep(s1.state, [pre], T + 60_000, DAY).events).toEqual([]);
  });

  it('tells you the result once, and the mood lasts: a win the rest of the day, a loss into the next morning', () => {
    const won: Game = { ...pre, state: 'post', us: 117, them: 112, detail: 'Final', result: 'won' };
    const r = sportsStep(emptySports(), [won], at(22, 15), DAY);
    expect(r.events).toEqual([{ kind: 'final', game: won }]);
    expect(moodNow(r.state, at(23))).toEqual({ teamId: 'nba:2', result: 'won' });
    expect(moodNow(r.state, at(23) + 2 * 3_600_000)).toBeNull();
    expect(sportsStep(r.state, [won], at(22, 20), DAY).events).toEqual([]);

    const lost: Game = { ...won, us: 100, them: 110, result: 'lost' };
    const l = sportsStep(emptySports(), [lost], at(22, 15), DAY);
    expect(moodNow(l.state, at(22, 30))).toEqual({ teamId: 'nba:2', result: 'lost' });
    const nextMorning = new Date(2026, 10, 4, 9, 0).getTime();
    expect(moodNow(l.state, nextMorning)).toEqual({ teamId: 'nba:2', result: 'lost' });
    const nextAfternoon = new Date(2026, 10, 4, 13, 0).getTime();
    expect(moodNow(l.state, nextAfternoon)).toBeNull();
  });

  it('does not tell you about a game that ended long ago', () => {
    const old: Game = { ...pre, start: at(19) - 2 * 86_400_000, state: 'post', us: 1, them: 2, result: 'lost' };
    expect(sportsStep(emptySports(), [old], T, DAY).events).toEqual([]);
  });

  it('remembers what it said across restarts, but not forever', () => {
    const s = sportsStep(emptySports(), [pre], T, DAY).state;
    const back = normalizeSports(JSON.parse(JSON.stringify(s)), T);
    expect(sportsStep(back, [pre], T + 1000, DAY).events).toEqual([]);
    expect(Object.keys(normalizeSports({ said: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`g${i}`, { at: T }])) }, T).said).length).toBeLessThanOrEqual(SPORTS.REMEMBER_GAMES);
  });
});
