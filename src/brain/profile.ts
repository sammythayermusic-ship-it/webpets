// What the pets know about you (AFTER-BAKEOFF Step E): what to call you, the teams you follow, the
// things you like. Filled in on the "Get to know me" card, or in chat after the pet asks. Pure, and
// plain data, so it can sync to a phone one day. It stays on the Mac; "Forget me" empties it.
//
// The profile is about you, not about one pet: a new pet already knows your name.

export const PROFILE_VERSION = 1;
export const MAX_TEAMS = 6;
export const MAX_INTERESTS = 12;
/** Things you like that are not on the list, in your own words. */
export const MAX_OWN = 5;
export const NAME_MAX = 24;
export const OWN_MAX = 24;

export interface Profile {
  version: typeof PROFILE_VERSION;
  /** What the pet calls you; null until you say. */
  name: string | null;
  /** Team ids (src/brain/teams.ts), in the order you added them. */
  teams: readonly string[];
  /** Interest ids (src/brain/interests.ts). */
  interests: readonly string[];
  /** Things you like that are not on the list, lower case ("bird watching"). */
  own: readonly string[];
  /** When anything last changed. */
  updatedAt: number;
}

export function emptyProfile(now: number): Profile {
  return { version: PROFILE_VERSION, name: null, teams: [], interests: [], own: [], updatedAt: now };
}

export function knowsYou(p: Profile): boolean {
  return p.name !== null || p.teams.length > 0 || p.interests.length > 0 || p.own.length > 0;
}

/** Letters (any alphabet), spaces, hyphens and apostrophes; at most three words; each word capitalised. */
export function cleanName(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ').replace(/[’‘]/g, "'");
  if (s.length === 0 || s.length > NAME_MAX) return null;
  if (!/^[\p{L}][\p{L}' -]*$/u.test(s)) return null;
  if (s.split(' ').length > 3) return null;
  return s.replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** A hobby in your words: lower case, letters, digits, spaces and & ' -, two to OWN_MAX characters. */
export function cleanOwn(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ').replace(/[’‘]/g, "'").toLowerCase();
  if (s.length < 2 || s.length > OWN_MAX) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}&' -]*$/u.test(s)) return null;
  return s;
}

function added(list: readonly string[], v: string, max: number): readonly string[] | null {
  if (list.includes(v) || list.length >= max) return null;
  return [...list, v];
}

export function withName(p: Profile, raw: string | null, now: number): Profile {
  if (raw === null) return { ...p, name: null, updatedAt: now };
  const name = cleanName(raw);
  return name === null || name === p.name ? p : { ...p, name, updatedAt: now };
}

export function withTeam(p: Profile, id: string, now: number): Profile {
  const teams = added(p.teams, id, MAX_TEAMS);
  return teams ? { ...p, teams, updatedAt: now } : p;
}

export function withoutTeam(p: Profile, id: string, now: number): Profile {
  return p.teams.includes(id) ? { ...p, teams: p.teams.filter((t) => t !== id), updatedAt: now } : p;
}

export function withInterest(p: Profile, id: string, now: number): Profile {
  const interests = added(p.interests, id, MAX_INTERESTS);
  return interests ? { ...p, interests, updatedAt: now } : p;
}

export function withoutInterest(p: Profile, id: string, now: number): Profile {
  return p.interests.includes(id) ? { ...p, interests: p.interests.filter((t) => t !== id), updatedAt: now } : p;
}

export function withOwn(p: Profile, raw: string, now: number): Profile {
  const s = cleanOwn(raw);
  const own = s === null ? null : added(p.own, s, MAX_OWN);
  return own ? { ...p, own, updatedAt: now } : p;
}

export function withoutOwn(p: Profile, s: string, now: number): Profile {
  return p.own.includes(s) ? { ...p, own: p.own.filter((t) => t !== s), updatedAt: now } : p;
}

/** Parse a saved profile; anything malformed is dropped rather than failing the boot. */
export function normalizeProfile(v: unknown, now: number): Profile {
  if (typeof v !== 'object' || v === null) return emptyProfile(now);
  const o = v as Record<string, unknown>;
  const ids = (a: unknown, max: number): string[] => {
    if (!Array.isArray(a)) return [];
    const out: string[] = [];
    for (const x of a) if (typeof x === 'string' && x.length > 0 && x.length <= 64 && !out.includes(x)) out.push(x);
    return out.slice(0, max);
  };
  const own: string[] = [];
  if (Array.isArray(o['own'])) {
    for (const x of o['own']) {
      const s = typeof x === 'string' ? cleanOwn(x) : null;
      if (s !== null && !own.includes(s)) own.push(s);
    }
  }
  const updatedAt = typeof o['updatedAt'] === 'number' && Number.isFinite(o['updatedAt']) ? o['updatedAt'] : now;
  return {
    version: PROFILE_VERSION,
    name: typeof o['name'] === 'string' ? cleanName(o['name']) : null,
    teams: ids(o['teams'], MAX_TEAMS),
    interests: ids(o['interests'], MAX_INTERESTS),
    own: own.slice(0, MAX_OWN),
    updatedAt,
  };
}
