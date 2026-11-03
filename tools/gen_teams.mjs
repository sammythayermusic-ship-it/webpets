#!/usr/bin/env node
// Writes src/brain/data/teams.ts from ESPN's public team lists (AFTER-BAKEOFF Step E.1). No
// dependencies: Node 20+ and its global fetch.
//
//   node tools/gen_teams.mjs             fetch, check, write src/brain/data/teams.ts
//   node tools/gen_teams.mjs --dry-run   fetch and check, print the summary, write nothing
//
// Team ids are ESPN's, because Step F reads results from ESPN's scoreboards
// (site.api.espn.com/apis/site/v2/sports/<sport>/<league>/scoreboard), which name teams by the
// same ids. ESPN gives the id, abbreviation, place, name and colour; the hand-written tables below
// add what ESPN does not: what fans call a soccer club, the nicknames people type (ALIASES), and
// which nicknames are everyday words (EVERYDAY). Rerun it each season (promotion and relegation
// change the Premier League's 20; expansion changes the rest) and read the warnings.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/brain/data/teams.ts');
const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
// The default page is big enough today, but not promised; ask for more than any league has.
const QUERY = '?limit=1000';

/** The order here is the order of LEAGUES. `exact`: the count is fixed, anything else is an error. */
const LEAGUES = [
  { id: 'nfl', name: 'National Football League', short: 'NFL', sport: 'football', espn: 'football/nfl', exact: 32 },
  { id: 'nba', name: 'National Basketball Association', short: 'NBA', sport: 'basketball', espn: 'basketball/nba', exact: 30 },
  { id: 'wnba', name: "Women's National Basketball Association", short: 'WNBA', sport: 'basketball', espn: 'basketball/wnba', min: 10 },
  { id: 'mlb', name: 'Major League Baseball', short: 'MLB', sport: 'baseball', espn: 'baseball/mlb', exact: 30 },
  { id: 'nhl', name: 'National Hockey League', short: 'NHL', sport: 'hockey', espn: 'hockey/nhl', exact: 32 },
  { id: 'mls', name: 'Major League Soccer', short: 'MLS', sport: 'soccer', espn: 'soccer/usa.1', min: 10 },
  { id: 'nwsl', name: "National Women's Soccer League", short: 'NWSL', sport: 'soccer', espn: 'soccer/usa.nwsl', min: 10 },
  { id: 'epl', name: 'Premier League', short: 'Premier League', sport: 'soccer', espn: 'soccer/eng.1', exact: 20 },
];

/**
 * Soccer: ESPN's `name` and `location` are both the full club name ("Atlanta United FC"), so the
 * pet's nickname (read in "Go {nickname}!" and "the {nickname}") and the home city are written
 * here. US-style clubs keep the nickname fans chant ("Fire", "Crew", "Union"); the rest use the
 * short club name ("Inter Miami", "Man City"). A club missing here (newly promoted) falls back to
 * ESPN's short name with a warning.
 */
const SOCCER = {
  // MLS
  'mls:18418': { location: 'Atlanta', nickname: 'Atlanta United' },
  'mls:20906': { location: 'Austin', nickname: 'Austin FC' },
  'mls:9720': { location: 'Montréal', nickname: 'CF Montréal' },
  'mls:21300': { location: 'Charlotte', nickname: 'Charlotte FC' },
  'mls:182': { location: 'Chicago', nickname: 'Fire' },
  'mls:184': { location: 'Colorado', nickname: 'Rapids' },
  'mls:183': { location: 'Columbus', nickname: 'Crew' },
  'mls:193': { location: 'Washington', nickname: 'D.C. United' },
  'mls:18267': { location: 'Cincinnati', nickname: 'FC Cincinnati' },
  'mls:185': { location: 'Dallas', nickname: 'FC Dallas' },
  'mls:6077': { location: 'Houston', nickname: 'Dynamo' },
  'mls:20232': { location: 'Miami', nickname: 'Inter Miami' },
  'mls:187': { location: 'Los Angeles', nickname: 'Galaxy' },
  'mls:18966': { location: 'Los Angeles', nickname: 'LAFC' },
  'mls:17362': { location: 'Minnesota', nickname: 'Minnesota United' },
  'mls:18986': { location: 'Nashville', nickname: 'Nashville SC' },
  'mls:189': { location: 'New England', nickname: 'Revolution' },
  'mls:17606': { location: 'New York', nickname: 'NYCFC' },
  'mls:12011': { location: 'Orlando', nickname: 'Orlando City' },
  'mls:10739': { location: 'Philadelphia', nickname: 'Union' },
  'mls:9723': { location: 'Portland', nickname: 'Timbers' },
  'mls:4771': { location: 'Salt Lake City', nickname: 'Real Salt Lake' },
  'mls:190': { location: 'New York', nickname: 'Red Bulls' },
  'mls:22529': { location: 'San Diego', nickname: 'San Diego FC' },
  'mls:191': { location: 'San Jose', nickname: 'Earthquakes' },
  'mls:9726': { location: 'Seattle', nickname: 'Sounders' },
  'mls:186': { location: 'Kansas City', nickname: 'Sporting KC' },
  'mls:21812': { location: 'St. Louis', nickname: 'St. Louis City' },
  'mls:7318': { location: 'Toronto', nickname: 'Toronto FC' },
  'mls:9727': { location: 'Vancouver', nickname: 'Whitecaps' },
  // NWSL
  'nwsl:21422': { location: 'Los Angeles', nickname: 'Angel City' },
  'nwsl:22187': { location: 'Bay Area', nickname: 'Bay FC' },
  'nwsl:131562': { location: 'Boston', nickname: 'Boston Legacy' },
  'nwsl:15360': { location: 'Chicago', nickname: 'Chicago Stars' },
  'nwsl:131563': { location: 'Denver', nickname: 'Denver Summit' },
  'nwsl:15364': { location: 'New York', nickname: 'Gotham FC' },
  'nwsl:17346': { location: 'Houston', nickname: 'Dash' },
  'nwsl:20907': { location: 'Kansas City', nickname: 'Current' },
  'nwsl:15366': { location: 'North Carolina', nickname: 'Courage' },
  'nwsl:18206': { location: 'Orlando', nickname: 'Pride' },
  'nwsl:15362': { location: 'Portland', nickname: 'Thorns' },
  'nwsl:20905': { location: 'Louisville', nickname: 'Racing Louisville' },
  'nwsl:21423': { location: 'San Diego', nickname: 'Wave' },
  'nwsl:15363': { location: 'Seattle', nickname: 'Reign' },
  'nwsl:19141': { location: 'Utah', nickname: 'Royals' },
  'nwsl:15365': { location: 'Washington', nickname: 'Spirit' },
  // Premier League (2026-27)
  'epl:349': { location: 'Bournemouth', nickname: 'Bournemouth' },
  'epl:359': { location: 'London', nickname: 'Arsenal' },
  'epl:362': { location: 'Birmingham', nickname: 'Aston Villa' },
  'epl:337': { location: 'London', nickname: 'Brentford' },
  'epl:331': { location: 'Brighton', nickname: 'Brighton' },
  'epl:363': { location: 'London', nickname: 'Chelsea' },
  'epl:388': { location: 'Coventry', nickname: 'Coventry' },
  'epl:384': { location: 'London', nickname: 'Crystal Palace' },
  'epl:368': { location: 'Liverpool', nickname: 'Everton' },
  'epl:370': { location: 'London', nickname: 'Fulham' },
  'epl:306': { location: 'Hull', nickname: 'Hull City' },
  'epl:373': { location: 'Ipswich', nickname: 'Ipswich' },
  'epl:357': { location: 'Leeds', nickname: 'Leeds' },
  'epl:364': { location: 'Liverpool', nickname: 'Liverpool' },
  'epl:382': { location: 'Manchester', nickname: 'Man City' },
  'epl:360': { location: 'Manchester', nickname: 'Man United' },
  'epl:361': { location: 'Newcastle', nickname: 'Newcastle' },
  'epl:393': { location: 'Nottingham', nickname: 'Nottingham Forest' },
  'epl:366': { location: 'Sunderland', nickname: 'Sunderland' },
  'epl:367': { location: 'London', nickname: 'Tottenham' },
};

/** Corrections to ESPN's US-league fields. */
const OVERRIDES = {
  // ESPN's location is "Athletics" (the club dropped "Oakland"); they play in Sacramento until Las Vegas.
  'mlb:11': { location: 'Sacramento' },
};

/**
 * What people type for a team beyond its location, nickname and display name (those always count).
 * Lower case; letters, digits, spaces and ' . & - only. A shared nickname goes on every team it can
 * mean ("sox", "bucs", "bolts", "spurs"): the app asks "which one?". No everyday words: an alias
 * always counts on its own, so "cards", "pens", "caps", "a's", "the blues", "black cats" stay out.
 */
const ALIASES = {
  // NFL
  'nfl:3': ['da bears'],
  'nfl:4': ['who dey'],
  'nfl:6': ["america's team"],
  'nfl:30': ['jags'],
  'nfl:12': ['kc chiefs'],
  'nfl:13': ['oakland raiders'],
  'nfl:24': ['bolts', 'san diego chargers'],
  'nfl:14': ['la rams'],
  'nfl:15': ['phins'],
  'nfl:16': ['vikes'],
  'nfl:17': ['pats'],
  'nfl:18': ['who dat'],
  'nfl:19': ['ny giants', 'g-men'],
  'nfl:20': ['ny jets'],
  'nfl:25': ['niners', 'forty niners', 'forty-niners'],
  'nfl:26': ['hawks'],
  'nfl:27': ['bucs'],
  // NBA
  'nba:5': ['cavs'],
  'nba:6': ['mavs'],
  'nba:9': ['gsw'],
  'nba:13': ['la lakers'],
  'nba:29': ['grizz'],
  'nba:16': ['t-wolves', 'twolves'],
  'nba:3': ['pels'],
  'nba:18': ['ny knicks'],
  'nba:25': ['okc', 'okc thunder'],
  'nba:20': ['sixers'],
  'nba:22': ['blazers', 'trailblazers'],
  // WNBA
  'wnba:9': ['ny liberty'],
  // MLB
  'mlb:29': ['d-backs', 'dbacks'],
  'mlb:11': ['oakland a\'s', 'oakland athletics'],
  'mlb:2': ['sox', 'bosox'],
  'mlb:16': ['cubbies'],
  'mlb:4': ['sox', 'chisox'],
  'mlb:18': ['stros'],
  'mlb:3': ['la angels', 'anaheim angels'],
  'mlb:19': ['la dodgers'],
  'mlb:21': ['ny mets'],
  'mlb:10': ['yanks', 'bronx bombers', 'ny yankees'],
  'mlb:22': ['phils'],
  'mlb:23': ['bucs'],
  'mlb:26': ['sf giants'],
  'mlb:24': ['st louis cardinals'],
  'mlb:14': ['jays'],
  'mlb:20': ['nats'],
  // NHL
  'nhl:25': ['mighty ducks'],
  'nhl:7': ['canes'],
  'nhl:4': ['hawks'],
  'nhl:17': ['avs'],
  'nhl:29': ['cbj'],
  'nhl:8': ['la kings'],
  'nhl:10': ['habs'],
  'nhl:27': ['preds'],
  'nhl:11': ['nj devils'],
  'nhl:12': ['ny islanders'],
  'nhl:13': ['ny rangers'],
  'nhl:14': ['sens'],
  'nhl:19': ['st louis blues'],
  'nhl:20': ['bolts'],
  'nhl:21': ['leafs'],
  'nhl:129764': ['utah hockey club'],
  'nhl:37': ['vgk'],
  // MLS
  'mls:18418': ['atl utd', 'atlanta utd'],
  'mls:9720': ['cf montreal', 'montreal impact'],
  'mls:193': ['dc united'],
  'mls:18267': ['fc cincy'],
  'mls:18966': ['los angeles fc'],
  'mls:17362': ['loons'],
  'mls:189': ['revs'],
  'mls:17606': ['nyc fc'],
  'mls:4771': ['rsl'],
  'mls:190': ['ny red bulls', 'new york red bulls', 'rbny'],
  'mls:191': ['quakes'],
  'mls:186': ['skc'],
  'mls:21812': ['st louis city', 'stl city'],
  'mls:7318': ['tfc'],
  // NWSL
  'nwsl:15360': ['red stars', 'chicago red stars'],
  'nwsl:20907': ['kc current'],
  'nwsl:15366': ['nc courage'],
  'nwsl:15363': ['ol reign'],
  // Premier League
  'epl:359': ['gunners', 'gooners'],
  'epl:331': ['brighton and hove albion'],
  'epl:363': ['chelsea fc'],
  'epl:388': ['sky blues'],
  'epl:368': ['the toffees'],
  'epl:370': ['cottagers'],
  'epl:373': ['tractor boys'],
  'epl:364': ['lfc', 'the reds'],
  'epl:382': ['sky blues'],
  'epl:360': ['man u', 'man utd', 'red devils'],
  'epl:361': ['the toon'],
  'epl:393': ['nottm forest'],
  'epl:367': ['spurs'],
};

/**
 * Teams whose nickname is a word someone (a kid especially) might type in an ordinary sentence:
 * animals ("I love bears", "penguins eat fish"), weather and sky ("thunder", "lightning", "stars"),
 * food ("nuggets", "wings", "hash browns"), money ("bills", "bucks"), stories ("wizards", "pirates",
 * "giants", "titans"), plain words ("magic", "heat", "union", "current", "courage") and a name
 * ("Chelsea"). On its own such a nickname only counts with the location or a sports cue.
 */
const EVERYDAY = new Set([
  // NFL: Cardinals, Bills, Bears, Browns, Cowboys, Lions, Chargers, Dolphins, Vikings, Saints, Giants, Jets, Eagles, Titans
  'nfl:22', 'nfl:2', 'nfl:3', 'nfl:5', 'nfl:6', 'nfl:8', 'nfl:24', 'nfl:15', 'nfl:16', 'nfl:18', 'nfl:19', 'nfl:20', 'nfl:21', 'nfl:10',
  // NBA: Nets, Hornets, Nuggets, Warriors, Rockets, Clippers, Heat, Bucks, Thunder, Magic, Kings, Raptors, Jazz, Wizards
  'nba:17', 'nba:30', 'nba:7', 'nba:9', 'nba:10', 'nba:12', 'nba:14', 'nba:15', 'nba:25', 'nba:19', 'nba:23', 'nba:28', 'nba:26', 'nba:27',
  // WNBA: Dream, Sky, Sun, Wings, Valkyries, Fever, Aces, Sparks, Liberty, Mercury, Fire, Storm, Tempo
  'wnba:20', 'wnba:19', 'wnba:18', 'wnba:3', 'wnba:129689', 'wnba:5', 'wnba:17', 'wnba:6', 'wnba:9', 'wnba:11', 'wnba:132052', 'wnba:14', 'wnba:131935',
  // MLB: Athletics, Cubs, Guardians, Rockies, Tigers, Royals, Angels, Marlins, Twins, Pirates, Giants, Cardinals, Rays, Rangers
  'mlb:11', 'mlb:16', 'mlb:5', 'mlb:27', 'mlb:6', 'mlb:7', 'mlb:3', 'mlb:28', 'mlb:9', 'mlb:23', 'mlb:26', 'mlb:24', 'mlb:30', 'mlb:13',
  // NHL: Ducks, Flames, Hurricanes, Avalanche, Stars, Kings, Wild, Predators, Devils, Rangers, Senators, Flyers, Penguins,
  // Sharks, Kraken, Blues, Lightning, Mammoth, Capitals, Jets
  'nhl:25', 'nhl:3', 'nhl:7', 'nhl:17', 'nhl:9', 'nhl:8', 'nhl:30', 'nhl:27', 'nhl:11', 'nhl:13', 'nhl:14', 'nhl:15', 'nhl:16',
  'nhl:18', 'nhl:124292', 'nhl:19', 'nhl:20', 'nhl:129764', 'nhl:23', 'nhl:28',
  // MLS: Fire, Rapids, Crew, Galaxy, Revolution, Union, Earthquakes
  'mls:182', 'mls:184', 'mls:183', 'mls:187', 'mls:189', 'mls:10739', 'mls:191',
  // NWSL: Dash, Current, Courage, Pride, Thorns, Wave, Reign, Royals, Spirit
  'nwsl:17346', 'nwsl:20907', 'nwsl:15366', 'nwsl:18206', 'nwsl:15362', 'nwsl:21423', 'nwsl:15363', 'nwsl:19141', 'nwsl:15365',
  // Premier League: Chelsea (a first name)
  'epl:363',
]);

const ALIAS_CHARS = /^[a-z0-9](?:[a-z0-9 '.&-]*[a-z0-9.'])?$/;

const warnings = [];
const warn = (msg) => warnings.push(msg);
const fail = (msg) => {
  console.error(`gen_teams: ${msg}`);
  process.exit(1);
};

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function normColor(raw, id) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const s = String(raw).trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(s)) {
    warn(`${id}: colour ${JSON.stringify(raw)} is not rrggbb, left out`);
    return undefined;
  }
  return `#${s.toLowerCase()}`;
}

function aliasesFor(id, own) {
  const list = ALIASES[id] ?? [];
  const seen = new Set();
  for (const a of list) {
    if (a !== a.trim().toLowerCase() || !ALIAS_CHARS.test(a) || a.includes('  ')) fail(`${id}: alias ${JSON.stringify(a)} must be lower case, trimmed, letters/digits/spaces/'.&- only`);
    if (seen.has(a)) fail(`${id}: alias ${JSON.stringify(a)} listed twice`);
    if (own.has(a)) fail(`${id}: alias ${JSON.stringify(a)} repeats the team's own name; drop it`);
    seen.add(a);
  }
  return list;
}

async function leagueTeams(league) {
  const url = `${BASE}/${league.espn}/teams${QUERY}`;
  const json = await fetchJson(url);
  const raw = json?.sports?.[0]?.leagues?.[0]?.teams;
  if (!Array.isArray(raw)) fail(`${url}: no sports[0].leagues[0].teams array`);
  const byId = new Map();
  for (const entry of raw) {
    const t = entry?.team;
    if (!t || t.id === undefined || !t.displayName) {
      warn(`${league.id}: skipped an entry with no id or name`);
      continue;
    }
    const id = `${league.id}:${t.id}`;
    // All-star, exhibition and defunct entries: ESPN flags them; none appear in today's lists.
    if (t.isActive === false || t.isAllStar === true || /all[- ]?stars?\b/i.test(t.displayName)) {
      warn(`${id}: dropped ${t.displayName} (inactive or all-star)`);
      continue;
    }
    if (byId.has(id)) {
      warn(`${id}: listed twice, kept the first`);
      continue;
    }
    byId.set(id, t);
  }
  return { url, teams: [...byId.entries()] };
}

function toTeam(league, id, t) {
  let location = String(t.location ?? '').trim();
  let nickname = String(t.name ?? '').trim();
  if (league.sport === 'soccer') {
    const s = SOCCER[id];
    if (s) ({ location, nickname } = s);
    else {
      nickname = String(t.shortDisplayName || t.name || t.displayName).trim();
      warn(`${id}: ${t.displayName} has no SOCCER entry; nickname "${nickname}", location "${location}" from ESPN`);
    }
  }
  const o = OVERRIDES[id];
  if (o?.location) location = o.location;
  if (o?.nickname) nickname = o.nickname;
  const display = String(t.displayName).trim();
  const abbr = String(t.abbreviation ?? '').trim();
  if (!abbr) fail(`${id}: ${display} has no abbreviation`);
  if (!location || !nickname) fail(`${id}: ${display} has no location or nickname`);
  const own = new Set([location, nickname, display].map((s) => s.toLowerCase()));
  const team = {
    id,
    league: league.id,
    espnId: String(t.id),
    abbr,
    location,
    nickname,
    display,
  };
  const color = normColor(t.color, id);
  if (color) team.color = color;
  team.aliases = aliasesFor(id, own);
  if (EVERYDAY.has(id)) team.everydayWord = true;
  return team;
}

function lit(v) {
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`;
  if (typeof v === 'string') return v.includes("'") && !v.includes('"') ? JSON.stringify(v) : `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return String(v);
}

function objLine(o) {
  return `{ ${Object.entries(o)
    .map(([k, v]) => `${k}: ${lit(v)}`)
    .join(', ')} }`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const results = await Promise.all(LEAGUES.map(async (l) => ({ league: l, ...(await leagueTeams(l)) })));

  const all = [];
  const seen = new Set();
  for (const { league, teams } of results) {
    if (league.exact !== undefined && teams.length !== league.exact) {
      fail(`${league.id}: ESPN listed ${teams.length} teams, expected ${league.exact} (truncated page, or the league changed size: update LEAGUES and data.test.ts)`);
    }
    if (league.min !== undefined && teams.length < league.min) fail(`${league.id}: only ${teams.length} teams`);
    const built = teams.map(([id, t]) => toTeam(league, id, t));
    built.sort((a, b) => a.display.localeCompare(b.display, 'en'));
    for (const t of built) seen.add(t.id);
    all.push(...built);
  }

  for (const [name, keys] of [
    ['SOCCER', Object.keys(SOCCER)],
    ['OVERRIDES', Object.keys(OVERRIDES)],
    ['ALIASES', Object.keys(ALIASES)],
    ['EVERYDAY', [...EVERYDAY]],
  ]) {
    for (const k of keys) if (!seen.has(k)) warn(`${name}: ${k} is not in ESPN's lists any more (relegated or renamed?)`);
  }

  const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  const leagueLines = LEAGUES.map(({ id, name, short, sport, espn }) => `  ${objLine({ id, name, short, sport, espn })},`);
  const teamLines = [];
  let prev = '';
  for (const t of all) {
    if (t.league !== prev) {
      const l = LEAGUES.find((x) => x.id === t.league);
      teamLines.push(`  // ${l.short}`);
      prev = t.league;
    }
    teamLines.push(`  ${objLine(t)},`);
  }

  const src = [
    `// GENERATED by tools/gen_teams.mjs on ${date}. Do not edit by hand: change the tables in the script`,
    '// (SOCCER, OVERRIDES, ALIASES, EVERYDAY) and run `node tools/gen_teams.mjs` again.',
    '//',
    "// Source: ESPN's public team lists, one per league:",
    ...results.map(({ url }) => `//   ${url}`),
    "// `espnId` (and the `id` built from it) is ESPN's team id, which is what Step F's ESPN scoreboards",
    '// report results by, so a stored id keeps working across regenerations. For soccer, ESPN gives the',
    '// club name as both name and location, so `nickname` and `location` come from the script.',
    "import type { League, Team } from '../teams';",
    '',
    'export const LEAGUES: readonly League[] = [',
    ...leagueLines,
    '];',
    '',
    '/** Every team, by league in LEAGUES order, then by display name. */',
    'export const TEAMS: readonly Team[] = [',
    ...teamLines,
    '];',
    '',
  ].join('\n');

  console.log(results.map(({ league, teams }) => `${league.id} ${teams.length}`).join(', '));
  console.log(`${all.length} teams, ${all.filter((t) => t.everydayWord).length} everyday nicknames, ${all.reduce((n, t) => n + t.aliases.length, 0)} aliases`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (dryRun) return;
  writeFileSync(OUT, src);
  console.log(`wrote ${OUT}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
