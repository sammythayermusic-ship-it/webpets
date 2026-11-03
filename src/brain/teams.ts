// Sports teams you can follow (AFTER-BAKEOFF Step E.1; Step F reports their results). The data is
// in ./data/teams.ts, read from ESPN's public team lists so Step F's scoreboards use the same ids.

export type LeagueId = 'nfl' | 'nba' | 'wnba' | 'mlb' | 'nhl' | 'mls' | 'nwsl' | 'epl';

export interface League {
  id: LeagueId;
  /** "National Football League" */
  name: string;
  /** What people call it: "NFL", "Premier League". */
  short: string;
  sport: 'football' | 'basketball' | 'baseball' | 'hockey' | 'soccer';
  /** ESPN's path for this league: "football/nfl", "soccer/eng.1". */
  espn: string;
}

export interface Team {
  /** `${league}:${espnId}`, stable: what a profile stores. */
  id: string;
  league: LeagueId;
  /** ESPN's team id, as a string. */
  espnId: string;
  /** "BOS" */
  abbr: string;
  /** "Boston" */
  location: string;
  /** What the pet calls them: "Red Sox". */
  nickname: string;
  /** "Boston Red Sox" */
  display: string;
  /** The team's main colour, "#bd3039", when ESPN gives one. */
  color?: string;
  /**
   * Lower-case words or phrases someone might type that mean this team, beyond the location, the
   * nickname and the display name, which always count ("sox", "niners", "habs", "the bronx bombers").
   */
  aliases: readonly string[];
  /**
   * The nickname is an everyday word ("Heat", "Magic", "Wild", "Sky", "Union", "Current"): on its
   * own it only counts with the location or a sports cue ("miami heat", "go heat"), so "the heat
   * today" is not a Miami fan.
   */
  everydayWord?: boolean;
}
