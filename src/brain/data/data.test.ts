import { describe, expect, it } from 'vitest';
import type { LeagueId } from '../teams';
import { INTERESTS } from './interests';
import { LEAGUES, TEAMS } from './teams';

const LEAGUE_IDS: readonly LeagueId[] = ['nfl', 'nba', 'wnba', 'mlb', 'nhl', 'mls', 'nwsl', 'epl'];
const EXACT: Partial<Record<LeagueId, number>> = { nfl: 32, nba: 30, mlb: 30, nhl: 32, epl: 20 };
const ADULT = /\b(beer|wine|bet|betting|casino|vape|weed)\b/;
const TYPED = /^[a-z0-9](?:[a-z0-9 '.&-]*[a-z0-9.'])?$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const cleanTyped = (s: string): boolean => s === s.trim().toLowerCase() && TYPED.test(s) && !s.includes('  ');
const dupes = (xs: readonly string[]): string[] => xs.filter((x, i) => xs.indexOf(x) !== i);

describe('LEAGUES', () => {
  it('are the eight LeagueIds, once each, in order', () => {
    expect(LEAGUES.map((l) => l.id)).toEqual(LEAGUE_IDS);
  });

  it('name an ESPN path for their sport', () => {
    for (const l of LEAGUES) {
      expect(l.espn.startsWith(`${l.sport}/`), l.id).toBe(true);
      expect(l.name.length, l.id).toBeGreaterThan(0);
      expect(l.short.length, l.id).toBeGreaterThan(0);
    }
  });
});

describe('TEAMS', () => {
  it('ids are `${league}:${espnId}`, ESPN ids are numeric, and no id repeats', () => {
    for (const t of TEAMS) {
      expect(t.id).toBe(`${t.league}:${t.espnId}`);
      expect(t.espnId, t.id).toMatch(/^\d+$/);
      expect(LEAGUE_IDS, t.id).toContain(t.league);
    }
    expect(dupes(TEAMS.map((t) => t.id))).toEqual([]);
  });

  it('every league has its teams: exact where the count is fixed, at least 10 elsewhere', () => {
    for (const id of LEAGUE_IDS) {
      const n = TEAMS.filter((t) => t.league === id).length;
      const exact = EXACT[id];
      if (exact !== undefined) expect(n, id).toBe(exact);
      else expect(n, id).toBeGreaterThanOrEqual(10);
    }
  });

  it('are sorted by league, then display name', () => {
    const sorted = [...TEAMS].sort(
      (a, b) => LEAGUE_IDS.indexOf(a.league) - LEAGUE_IDS.indexOf(b.league) || a.display.localeCompare(b.display, 'en'),
    );
    expect(TEAMS.map((t) => t.id)).toEqual(sorted.map((t) => t.id));
  });

  it('have an abbreviation, a location, a nickname and a display name', () => {
    for (const t of TEAMS) {
      expect(t.abbr.trim().length, t.id).toBeGreaterThan(0);
      expect(t.location.trim().length, t.id).toBeGreaterThan(0);
      expect(t.nickname.trim().length, t.id).toBeGreaterThan(0);
      expect(t.display.trim().length, t.id).toBeGreaterThan(0);
    }
  });

  it('colours are #rrggbb when present', () => {
    for (const t of TEAMS) if (t.color !== undefined) expect(t.color, t.id).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('aliases are lower case, trimmed, typeable, and say something new', () => {
    for (const t of TEAMS) {
      const own = [t.location, t.nickname, t.display].map((s) => s.toLowerCase());
      for (const a of t.aliases) {
        expect(cleanTyped(a), `${t.id} "${a}"`).toBe(true);
        expect(own, `${t.id} "${a}" repeats the team's own name`).not.toContain(a);
      }
      expect(dupes(t.aliases), t.id).toEqual([]);
    }
  });

  it('everydayWord is set only as true', () => {
    for (const t of TEAMS) if ('everydayWord' in t) expect(t.everydayWord, t.id).toBe(true);
  });

  it('no alias is an adult word', () => {
    for (const t of TEAMS) for (const a of t.aliases) expect(a, t.id).not.toMatch(ADULT);
  });
});

describe('INTERESTS', () => {
  it('ids are kebab-case and unique', () => {
    for (const i of INTERESTS) expect(i.id).toMatch(KEBAB);
    expect(dupes(INTERESTS.map((i) => i.id))).toEqual([]);
  });

  it('labels are short, lower case, and unique', () => {
    for (const i of INTERESTS) {
      expect(i.label.length, i.id).toBeLessThanOrEqual(16);
      expect(cleanTyped(i.label), i.id).toBe(true);
    }
    expect(dupes(INTERESTS.map((i) => i.label))).toEqual([]);
  });

  it('words are lower case, trimmed, typeable, and not repeated within an interest', () => {
    for (const i of INTERESTS) {
      for (const w of i.words) {
        expect(cleanTyped(w), `${i.id} "${w}"`).toBe(true);
        expect(w, `${i.id} repeats its label`).not.toBe(i.label);
      }
      expect(dupes(i.words), i.id).toEqual([]);
    }
  });

  it('a word (or label) means one interest only', () => {
    const all = INTERESTS.flatMap((i) => [i.label, ...i.words]);
    expect(dupes(all)).toEqual([]);
  });

  it('no interest word is also a team name or alias, so a word means one thing', () => {
    const teamWords = new Set(TEAMS.flatMap((t) => [t.nickname.toLowerCase(), ...t.aliases]));
    const clashes = INTERESTS.flatMap((i) => [i.label, ...i.words].filter((w) => teamWords.has(w)).map((w) => `${i.id}: ${w}`));
    expect(clashes).toEqual([]);
  });

  it('nothing is an adult word', () => {
    for (const i of INTERESTS) for (const w of [i.label, ...i.words]) expect(w, i.id).not.toMatch(ADULT);
  });
});
