import { describe, expect, it } from 'vitest';
import { NEWS, emptyNews, interestFeedUrl, normalizeNews, parseFeed, pickStory, safeHeadline, toldStory } from './news';

const rss = (items: { title: string; link: string; date?: string; source?: string }[], channel = 'Good News Network'): string =>
  `<?xml version="1.0"?><rss><channel><title>${channel}</title>${items
    .map(
      (i) =>
        `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link>${i.date ? `<pubDate>${i.date}</pubDate>` : ''}${
          i.source ? `<source url="https://x.org">${i.source}</source>` : ''
        }</item>`,
    )
    .join('')}</channel></rss>`;

const NOW = Date.parse('2026-11-03T15:00:00Z');

describe('reading a feed', () => {
  it('takes the title, link, source and date of each story, entities decoded', () => {
    const xml = rss([{ title: 'Dogs&#8217; Paws &amp; Sunny Days', link: 'https://www.goodnewsnetwork.org/dogs/', date: 'Mon, 02 Nov 2026 10:00:00 +0000' }]);
    expect(parseFeed(xml, 'Good News Network')).toEqual([
      { title: 'Dogs’ Paws & Sunny Days', link: 'https://www.goodnewsnetwork.org/dogs/', source: 'Good News Network', published: Date.parse('2026-11-02T10:00:00Z') },
    ]);
  });

  it('splits the outlet off a Google News headline', () => {
    const xml = rss([{ title: 'Evidence of red blood cells seen in dinosaur fossil - Reuters', link: 'https://news.google.com/rss/articles/abc', source: 'Reuters' }]);
    expect(parseFeed(xml, 'Google News')[0]).toMatchObject({ title: 'Evidence of red blood cells seen in dinosaur fossil', source: 'Reuters' });
  });

  it('skips anything without an https link, and survives junk', () => {
    expect(parseFeed(rss([{ title: 'Hi', link: 'javascript:alert(1)' }]), 'X')).toEqual([]);
    expect(parseFeed('<html>not a feed</html>', 'X')).toEqual([]);
  });
});

describe('what counts as happy news', () => {
  it('keeps the feel-good and the curious', () => {
    for (const t of [
      'Whale Festival Kicks Off on Amelia Island Celebrating the Return of the Right Whale',
      'Astronomers spot a green star for the first time',
      'Kids build a library for their whole town',
    ])
      expect(safeHeadline(t), t).toBe(true);
  });

  it('drops tragedy, conflict, crime and politics, and anything too long', () => {
    for (const t of [
      'Over 750 Ukraine Civilians Evacuated from Famine Conditions in Most Substantial Truce of the War',
      'Green star powered by a dead planet',
      'Police arrest man after shooting at mall',
      'Senate passes bill after election fight',
      'The women’s boxing nights helping abuse survivors',
      'Judge accuses DOJ of weaponization',
      'Sinclair dinosaurs stolen for Halloween wedding',
      'A'.repeat(NEWS.MAX_HEADLINE + 1),
    ])
      expect(safeHeadline(t), t).toBe(false);
  });

  it('can be told to allow serious news', () => {
    expect(safeHeadline('Senate passes bill after election fight', { serious: true })).toBe(true);
    expect(safeHeadline('Police arrest man after shooting at mall', { serious: true })).toBe(false);
  });
});

describe('picking a story to tell', () => {
  const items = [
    { title: 'Old but good', link: 'https://a.org/1', source: 'A', published: NOW - 10 * 86_400_000 },
    { title: 'A town plants ten thousand trees', link: 'https://a.org/2', source: 'A', published: NOW - 3_600_000 },
    { title: 'War ends', link: 'https://a.org/3', source: 'A', published: NOW - 3_600_000 },
  ];

  it('tells a recent safe story it has not told before, once', () => {
    const s = pickStory(items, emptyNews(), NOW, () => 0);
    expect(s?.link).toBe('https://a.org/2');
    const told = toldStory(emptyNews(), s!, NOW);
    expect(pickStory(items, told, NOW, () => 0)).toBeNull();
  });

  it('keeps a bounded memory of what it told', () => {
    let n = emptyNews();
    for (let i = 0; i < NEWS.REMEMBER_STORIES + 20; i++) n = toldStory(n, { title: 't', link: `https://a.org/${i}`, source: 'A', published: NOW }, NOW);
    expect(n.told.length).toBe(NEWS.REMEMBER_STORIES);
    expect(normalizeNews(JSON.parse(JSON.stringify(n))).told.length).toBe(NEWS.REMEMBER_STORIES);
  });

  it('asks Google News about an interest, recent stories only', () => {
    expect(interestFeedUrl('video games')).toBe('https://news.google.com/rss/search?q=%22video%20games%22%20when%3A7d&hl=en-US&gl=US&ceid=US%3Aen');
  });
});
