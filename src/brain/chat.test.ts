import { describe, expect, it } from 'vitest';
import type { Interest } from './interests';
import type { Team } from './teams';
import { converse, emptyChat, moodToAsk, withExchange, type ChatState } from './chat';
import { emptyProfile, withInterest, withTeam, type Profile } from './profile';
import { understand, type Known } from './understand';

const team = (id: string, location: string, nickname: string, aliases: string[] = []): Team => ({
  id,
  league: id.split(':')[0] as Team['league'],
  espnId: id.split(':')[1]!,
  abbr: 'X',
  location,
  nickname,
  display: `${location} ${nickname}`,
  aliases,
});
const TEAMS: Team[] = [
  team('mlb:2', 'Boston', 'Red Sox'),
  team('nfl:19', 'New York', 'Giants'),
  team('mlb:26', 'San Francisco', 'Giants'),
];
const INTERESTS: Interest[] = [
  { id: 'baking', label: 'baking', words: ['bake'] },
  { id: 'dogs', label: 'dogs', words: ['dog'] },
];
const K: Known = { teams: TEAMS, interests: INTERESTS };
const T = 1_700_000_000_000;

function talk(state: ChatState, profile: Profile, text: string, choice: string | null = null) {
  return converse(state, understand(text, K), choice, profile, K, T, text);
}

describe('the conversation', () => {
  it('asks before it keeps an interest, and keeps it on a yes', () => {
    let r = talk(emptyChat(), emptyProfile(T), 'I love baking');
    expect(r.say).toEqual({ kind: 'teach', moment: 'ask-interest', vars: { interest: 'baking' }, choices: [{ label: 'Yes', value: 'yes' }, { label: 'No thanks', value: 'no' }] });
    expect(r.profile.interests).toEqual([]);
    r = talk(r.state, r.profile, 'yes');
    expect(r.say).toEqual({ kind: 'teach', moment: 'saved-interest', vars: { interest: 'baking' } });
    expect(r.profile.interests).toEqual(['baking']);
    expect(r.told).toBe(true);
    expect(r.state.pending).toBeNull();
  });

  it('lets it go on a no, and on a button press the same as typing', () => {
    let r = talk(emptyChat(), emptyProfile(T), 'my dog is the best');
    expect(r.say).toMatchObject({ moment: 'ask-interest', vars: { interest: 'dogs' } });
    r = talk(r.state, r.profile, '', 'no');
    expect(r.say).toEqual({ kind: 'teach', moment: 'declined', vars: {} });
    expect(r.profile.interests).toEqual([]);
    expect(r.told).toBe(false);
  });

  it('asks which team when a name is shared, and keeps the one you pick', () => {
    let r = talk(emptyChat(), emptyProfile(T), 'go giants');
    expect(r.say).toEqual({
      kind: 'teach',
      moment: 'which-team',
      vars: {},
      choices: [{ label: 'New York Giants', value: 'nfl:19' }, { label: 'San Francisco Giants', value: 'mlb:26' }, { label: 'Neither', value: 'no' }],
    });
    r = talk(r.state, r.profile, '', 'mlb:26');
    expect(r.say).toEqual({ kind: 'teach', moment: 'saved-team', vars: { team: 'Giants' } });
    expect(r.profile.teams).toEqual(['mlb:26']);
    // Typing the city works too.
    let s = talk(emptyChat(), emptyProfile(T), 'giants fan');
    s = talk(s.state, s.profile, 'new york');
    expect(s.profile.teams).toEqual(['nfl:19']);
  });

  it('asks about a single team by name, and says so when it already knows', () => {
    let r = talk(emptyChat(), emptyProfile(T), 'red sox!!');
    expect(r.say).toMatchObject({ moment: 'ask-team', vars: { team: 'Red Sox' } });
    r = talk(r.state, r.profile, 'yep');
    expect(r.profile.teams).toEqual(['mlb:2']);
    const again = talk(r.state, r.profile, 'red sox');
    expect(again.say).toEqual({ kind: 'teach', moment: 'already-know', vars: { thing: 'Red Sox' } });
  });

  it('asks before using a name', () => {
    let r = talk(emptyChat(), emptyProfile(T), 'my name is sam');
    expect(r.say).toMatchObject({ moment: 'ask-name', vars: { you: 'Sam' } });
    r = talk(r.state, r.profile, 'yes please');
    expect(r.profile.name).toBe('Sam');
    expect(r.say).toEqual({ kind: 'teach', moment: 'saved-name', vars: { you: 'Sam' } });
  });

  it('puts how you feel before filing things away, and remembers it to ask later', () => {
    const r = talk(emptyChat(), emptyProfile(T), "I'm sad, my dog is sick");
    expect(r.say).toEqual({ kind: 'chat', intent: 'sad' });
    expect(r.state.mood).toEqual({ mood: 'sad', at: T });
    expect(r.state.pending).toBeNull();
    expect(moodToAsk(r.state, T + 2 * 3_600_000)).toBe(false);
    expect(moodToAsk(r.state, T + 6 * 3_600_000)).toBe(true);
    expect(moodToAsk(r.state, T + 4 * 24 * 3_600_000)).toBe(false);
    expect(talk(r.state, r.profile, 'feeling great today').state.mood).toBeNull();
  });

  it('answers everything else in kind, and moves on if a question goes unanswered', () => {
    expect(talk(emptyChat(), emptyProfile(T), 'hi').say).toEqual({ kind: 'chat', intent: 'hello' });
    expect(talk(emptyChat(), emptyProfile(T), 'tell me a fact').say).toEqual({ kind: 'fact' });
    const asked = talk(emptyChat(), emptyProfile(T), 'baking is fun');
    const moved = talk(asked.state, asked.profile, 'what are you doing');
    expect(moved.say).toEqual({ kind: 'chat', intent: 'what-doing' });
    expect(moved.state.pending).toBeNull();
    expect(moved.profile.interests).toEqual([]);
  });

  it('does not ask again about things it knows, it just answers', () => {
    const p = withTeam(withInterest(emptyProfile(T), 'baking', T), 'mlb:2', T);
    expect(talk(emptyChat(), p, 'baking').say).toEqual({ kind: 'teach', moment: 'already-know', vars: { thing: 'baking' } });
    expect(talk(emptyChat(), p, 'do you like baking?').say).toEqual({ kind: 'chat', intent: 'question' });
  });

  it('counts the things you keep bringing up', () => {
    let s = emptyChat();
    const p = withInterest(emptyProfile(T), 'baking', T);
    for (let i = 0; i < 3; i++) s = talk(s, p, 'baking again').state;
    expect(s.mentions['baking']).toBe(3);
  });

  it('keeps the last few exchanges, short', () => {
    let s = emptyChat();
    for (let i = 0; i < 10; i++) s = withExchange(s, `hello ${i}`, 'x'.repeat(500));
    expect(s.recent.length).toBe(4);
    expect(s.recent[3]!.you).toBe('hello 9');
    expect(s.recent[3]!.pet.length).toBeLessThanOrEqual(200);
  });
});
