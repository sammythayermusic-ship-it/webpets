import { describe, expect, it } from 'vitest';
import type { Interest } from './interests';
import type { Team } from './teams';
import { understand, type Known } from './understand';

const team = (id: string, location: string, nickname: string, extra: Partial<Team> = {}): Team => ({
  id,
  league: id.split(':')[0] as Team['league'],
  espnId: id.split(':')[1]!,
  abbr: nickname.slice(0, 3).toUpperCase(),
  location,
  nickname,
  display: `${location} ${nickname}`,
  aliases: [],
  ...extra,
});

const TEAMS: Team[] = [
  team('mlb:2', 'Boston', 'Red Sox', { aliases: ['sox'] }),
  team('mlb:4', 'Chicago', 'White Sox', { aliases: ['sox'] }),
  team('nfl:19', 'New York', 'Giants'),
  team('mlb:26', 'San Francisco', 'Giants'),
  team('nba:14', 'Miami', 'Heat', { everydayWord: true }),
  team('nfl:25', 'San Francisco', '49ers', { aliases: ['niners'] }),
];
const INTERESTS: Interest[] = [
  { id: 'video-games', label: 'video games', words: ['gaming', 'minecraft', 'video game'] },
  { id: 'baking', label: 'baking', words: ['bake', 'cupcakes'] },
  { id: 'soccer', label: 'soccer', words: [] },
  { id: 'dogs', label: 'dogs', words: ['dog', 'puppy', 'puppies'] },
];
const K: Known = { teams: TEAMS, interests: INTERESTS };

describe('understanding what you type', () => {
  it('knows the everyday things people say to a pet', () => {
    const cases: [string, string][] = [
      ['hi!', 'hello'],
      ['Hey there', 'hello'],
      ['good morning', 'hello'],
      ['how are you?', 'how-are-you'],
      ['you ok', 'how-are-you'],
      ['what are you doing', 'what-doing'],
      ['I love you', 'love'],
      ["you're my favorite", 'love'],
      ['you are so cute', 'praise'],
      ['good fish', 'praise'],
      ['thank you', 'thanks'],
      ['thx', 'thanks'],
      ['bye', 'bye'],
      ['good night', 'bye'],
      ["I'm sad", 'sad'],
      ['had a bad day', 'sad'],
      ['hey, i am sad', 'sad'],
      ['I had a great day', 'happy'],
      ["i'm so tired", 'tired'],
      ['im bored', 'bored'],
      ['are you hungry?', 'hungry-talk'],
      ["what's your name?", 'name-ask'],
      ['tell me a joke', 'joke'],
      ['tell me a fact', 'fact'],
      ['do fish sleep?', 'question'],
      ['the plant is green', 'unknown'],
    ];
    for (const [text, intent] of cases) expect(understand(text, K).intent, text).toBe(intent);
  });

  it('hears a yes or a no to a question it asked', () => {
    expect(understand('yes', K).answer).toBe('yes');
    expect(understand('Yeah sure!', K).answer).toBe('yes');
    expect(understand('nope', K).answer).toBe('no');
    expect(understand('no thanks', K).answer).toBe('no');
    expect(understand('i like dogs', K).answer).toBeNull();
  });

  it('picks up your name only when you clearly give it', () => {
    expect(understand('my name is sam', K).name).toBe('Sam');
    expect(understand('call me Mary Jane', K).name).toBe('Mary Jane');
    expect(understand("my name's Ana.", K).name).toBe('Ana');
    expect(understand("i'm sad", K).name).toBeNull();
    expect(understand('my name is not important', K).name).toBeNull();
  });

  it('notices the things you like, but not the things you do not', () => {
    expect(understand('I love minecraft', K).interests).toEqual(['video-games']);
    expect(understand('baking cupcakes and walking my dog', K).interests).toEqual(['baking', 'dogs']);
    expect(understand("I don't like soccer", K).interests).toEqual([]);
    expect(understand('soccerball', K).interests).toEqual([]);
  });

  it('notices teams, asks which when a name is shared, and needs a cue for everyday words', () => {
    expect(understand('go red sox!', K).teams).toEqual([{ said: 'red sox', ids: ['mlb:2'] }]);
    expect(understand('the sox won', K).teams).toEqual([{ said: 'sox', ids: ['mlb:2', 'mlb:4'] }]);
    expect(understand('I love the Giants', K).teams).toEqual([{ said: 'giants', ids: ['nfl:19', 'mlb:26'] }]);
    expect(understand('new york giants fan', K).teams).toEqual([{ said: 'new york giants', ids: ['nfl:19'] }]);
    expect(understand('niners all day', K).teams).toEqual([{ said: 'niners', ids: ['nfl:25'] }]);
    expect(understand('the heat today is a lot', K).teams).toEqual([]);
    expect(understand('miami heat', K).teams).toEqual([{ said: 'miami heat', ids: ['nba:14'] }]);
    expect(understand('go heat', K).teams).toEqual([{ said: 'heat', ids: ['nba:14'] }]);
    expect(understand("I can't stand the Red Sox", K).teams).toEqual([]);
  });

  it('hears how you are feeling', () => {
    expect(understand("I'm sad today", K).mood).toBe('sad');
    expect(understand('so tired', K).mood).toBe('tired');
    expect(understand('best day ever', K).mood).toBe('happy');
    expect(understand('hello', K).mood).toBeNull();
  });
});
