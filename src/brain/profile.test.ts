import { describe, expect, it } from 'vitest';
import {
  MAX_INTERESTS,
  MAX_OWN,
  MAX_TEAMS,
  cleanName,
  cleanOwn,
  emptyProfile,
  knowsYou,
  normalizeProfile,
  withInterest,
  withName,
  withOwn,
  withTeam,
  withoutInterest,
  withoutOwn,
  withoutTeam,
} from './profile';

const T = 1_700_000_000_000;

describe('the profile', () => {
  it('starts empty and knows nothing', () => {
    const p = emptyProfile(T);
    expect(p).toEqual({ version: 1, name: null, teams: [], interests: [], own: [], updatedAt: T });
    expect(knowsYou(p)).toBe(false);
  });

  it('keeps a name only when it looks like a name', () => {
    expect(cleanName('  sam ')).toBe('Sam');
    expect(cleanName('mary-jane')).toBe('Mary-Jane');
    expect(cleanName("o'neil")).toBe("O'Neil");
    expect(cleanName('José')).toBe('José');
    expect(cleanName('ana   lucia')).toBe('Ana Lucia');
    expect(cleanName('')).toBeNull();
    expect(cleanName('a'.repeat(25))).toBeNull();
    expect(cleanName('sam123')).toBeNull();
    expect(cleanName('<b>hi</b>')).toBeNull();
    expect(cleanName('one two three four')).toBeNull();
  });

  it('keeps your own words for a hobby short and plain', () => {
    expect(cleanOwn('  Bird watching ')).toBe('bird watching');
    expect(cleanOwn('k-pop & dance')).toBe('k-pop & dance');
    expect(cleanOwn('x')).toBeNull();
    expect(cleanOwn('a'.repeat(25))).toBeNull();
    expect(cleanOwn('https://example.com')).toBeNull();
  });

  it('adds and removes teams and interests, without duplicates and up to a limit', () => {
    let p = emptyProfile(T);
    p = withTeam(p, 'mlb:2', T + 1);
    p = withTeam(p, 'mlb:2', T + 2);
    expect(p.teams).toEqual(['mlb:2']);
    expect(p.updatedAt).toBe(T + 1);
    for (let i = 0; i < MAX_TEAMS + 3; i++) p = withTeam(p, `nfl:${i}`, T);
    expect(p.teams.length).toBe(MAX_TEAMS);
    p = withoutTeam(p, 'mlb:2', T + 5);
    expect(p.teams).not.toContain('mlb:2');

    let q = emptyProfile(T);
    for (let i = 0; i < MAX_INTERESTS + 2; i++) q = withInterest(q, `i${i}`, T);
    expect(q.interests.length).toBe(MAX_INTERESTS);
    q = withoutInterest(q, 'i0', T);
    expect(q.interests).not.toContain('i0');
    for (let i = 0; i < MAX_OWN + 2; i++) q = withOwn(q, `thing ${String.fromCharCode(97 + i)}`, T);
    expect(q.own.length).toBe(MAX_OWN);
    q = withoutOwn(q, 'thing a', T);
    expect(q.own).not.toContain('thing a');
  });

  it('remembers a name, and knows you once it has anything', () => {
    const p = withName(emptyProfile(T), 'sam', T + 1);
    expect(p.name).toBe('Sam');
    expect(knowsYou(p)).toBe(true);
    expect(withName(p, '   ', T + 2).name).toBe('Sam');
    expect(withName(p, null, T + 2).name).toBeNull();
  });

  it('reads a saved profile, dropping anything malformed', () => {
    const p = normalizeProfile(
      { version: 1, name: 'sam', teams: ['mlb:2', 3, 'mlb:2'], interests: ['baking', null], own: ['bird watching', ''], updatedAt: 5 },
      T,
    );
    expect(p).toEqual({ version: 1, name: 'Sam', teams: ['mlb:2'], interests: ['baking'], own: ['bird watching'], updatedAt: 5 });
    expect(normalizeProfile('nonsense', T)).toEqual(emptyProfile(T));
    expect(normalizeProfile(null, T)).toEqual(emptyProfile(T));
  });
});
