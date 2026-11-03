// Happy news (AFTER-BAKEOFF Step F.2): feel-good stories, curious science, and headlines about the
// things you like, each told as one line in the pet's voice with a tap to open the real story. Pure.
// The headline is shown as published; the pet never says more than the headline does. Light only:
// no tragedies, conflict, crime or politics unless that is turned on, and never crime or violence.

export const NEWS = Object.freeze({
  /** Longer headlines do not fit the bubble with a frame around them; they are skipped, not cut. */
  MAX_HEADLINE: 100,
  /** Stories older than this are not news. */
  FRESH_MS: 4 * 24 * 3_600_000,
  REMEMBER_STORIES: 300,
});

/** Feel-good and curious feeds. Each was checked by hand on 2026-11-02 (DECISIONS.md). */
export const HAPPY_FEEDS: readonly { url: string; source: string }[] = [
  { url: 'https://www.goodnewsnetwork.org/feed/', source: 'Good News Network' },
  { url: 'https://www.optimistdaily.com/feed/', source: 'The Optimist Daily' },
  { url: 'https://www.positive.news/feed/', source: 'Positive News' },
  { url: 'https://www.sciencedaily.com/rss/top/science.xml', source: 'ScienceDaily' },
];

/** Google News search for an interest, stories from the last week. */
export function interestFeedUrl(label: string): string {
  const q = encodeURIComponent(`"${label}" when:7d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=${encodeURIComponent('US:en')}`;
}

export interface Story {
  title: string;
  link: string;
  /** Who published it, shown on the link. */
  source: string;
  /** Publication time, or 0 when the feed did not say. */
  published: number;
}

export interface NewsState {
  /** Links of stories told, newest last. */
  told: readonly string[];
}

export function emptyNews(): NewsState {
  return { told: [] };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, n: string) => ENTITIES[n] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(item: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(item);
  return m ? decode(m[1]!) : null;
}

/** The stories in an RSS feed. Google News titles end in " - Outlet": the outlet becomes the source. */
export function parseFeed(xml: string, source: string): Story[] {
  const out: Story[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const item = m[0];
    let title = tag(item, 'title');
    const link = tag(item, 'link');
    if (!title || !link || !/^https:\/\/[^\s]+$/.test(link)) continue;
    let from = source;
    const outlet = tag(item, 'source');
    if (outlet && title.endsWith(` - ${outlet}`)) {
      title = title.slice(0, -(outlet.length + 3)).trim();
      from = outlet;
    }
    const date = Date.parse(tag(item, 'pubDate') ?? '');
    out.push({ title, link, source: from, published: Number.isFinite(date) ? date : 0 });
  }
  return out;
}

// Never, whatever the setting: harm, crime, violence, death, disaster, adult topics.
const NEVER = /\b(kill\w*|dead|deadly|fatal\w*|death|deaths|die[ds]?|dying|murder\w*|shoot\w*|shot|gun\w*|stab\w*|attack\w*|bomb\w*|terror\w*|war|wars|warfare|invasion|famine|abuse\w*|assault\w*|rape\w*|sex\w*|porn\w*|drug\w*|overdose\w*|alcohol|crash\w*|disaster\w*|earthquake\w*|flood\w*|wildfire\w*|hurricane\w*|tornado\w*|victim\w*|injur\w*|hostage\w*|missing|cancer|suicide\w*|arrest\w*|police|prison\w*|jail\w*|crime\w*|criminal\w*|fraud|scam\w*|lawsuit\w*|sued|court|judge|trial|refugee\w*|evacuat\w*|casualt\w*|weapon\w*|weaponi\w*|military|troops|soldier\w*|explosion\w*|fire kills|tragic\w*|tragedy|grief|mourn\w*|funeral\w*|bloody|horror|haunting|scary)\b/i;
// Off unless serious news is allowed: politics and fights.
const SERIOUS = /\b(election\w*|vote[ds]?|voter\w*|voting|senate|senator\w*|congress\w*|parliament\w*|president\w*|presidential|governor\w*|minister\w*|democrat\w*|republican\w*|trump|biden|harris|politic\w*|campaign\w*|tariff\w*|doj|fbi|cia|ukraine|russia\w*|israel\w*|gaza|iran\w*|protest\w*|strike|strikes|immigra\w*|deport\w*|shutdown|recession|layoff\w*|inflation|sanction\w*|abortion|polariz\w*)\b/i;

/** A headline the pet may share: short enough, and light. */
export function safeHeadline(title: string, opts: { serious?: boolean } = {}): boolean {
  if (title.length === 0 || title.length > NEWS.MAX_HEADLINE) return false;
  if (NEVER.test(title)) return false;
  if (!opts.serious && SERIOUS.test(title)) return false;
  return true;
}

/** A recent, safe story not told before; the freshest few are equally likely. Null when there is none. */
export function pickStory(stories: readonly Story[], s: NewsState, now: number, rng: () => number, opts: { serious?: boolean } = {}): Story | null {
  const told = new Set(s.told);
  const fresh = stories
    .filter((x) => !told.has(x.link) && safeHeadline(x.title, opts) && (x.published === 0 || now - x.published <= NEWS.FRESH_MS))
    .sort((a, b) => b.published - a.published)
    .slice(0, 5);
  if (fresh.length === 0) return null;
  return fresh[Math.min(fresh.length - 1, Math.floor(rng() * fresh.length))]!;
}

export function toldStory(s: NewsState, story: Story, _now: number): NewsState {
  const told = [...s.told.filter((l) => l !== story.link), story.link];
  return { told: told.slice(Math.max(0, told.length - NEWS.REMEMBER_STORIES)) };
}

export function normalizeNews(v: unknown): NewsState {
  const told = (v as { told?: unknown } | null)?.told;
  if (!Array.isArray(told)) return emptyNews();
  const links = told.filter((x): x is string => typeof x === 'string' && x.startsWith('https://'));
  return { told: links.slice(Math.max(0, links.length - NEWS.REMEMBER_STORIES)) };
}
