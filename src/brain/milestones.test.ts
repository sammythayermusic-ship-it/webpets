import { describe, expect, it } from 'vitest';
import { milestonesDue, normalizeMilestones, winMilestone, type MilestoneFacts } from './milestones';

const DAY = 86_400_000;
const born = 1_700_000_000_000;
const facts = (days: number, meals = 0, bond: 0 | 1 | 2 | 3 = 0): MilestoneFacts => ({ bornAt: born, now: born + days * DAY + 1000, meals, bond });

describe('milestones', () => {
  it('marks a birthday once', () => {
    let s = normalizeMilestones(undefined, facts(0));
    const r = milestonesDue(s, facts(1));
    expect(r.due).toEqual([{ key: 'age:1d', moment: 'birthday', vars: { age: 'one day' } }]);
    s = r.state;
    expect(milestonesDue(s, facts(1.5)).due).toEqual([]);
    expect(milestonesDue(s, facts(7)).due).toEqual([{ key: 'age:1w', moment: 'birthday', vars: { age: 'one week' } }]);
  });

  it('marks meals and the bond, one line per kind even if several were passed', () => {
    const s = normalizeMilestones(undefined, facts(0, 5));
    const r = milestonesDue(s, facts(0.5, 120, 2));
    expect(r.due).toEqual([
      { key: 'meals:100', moment: 'meals', vars: { count: '100' } },
      { key: 'bond:2', moment: 'bond', vars: { bond: 'good friends' } },
    ]);
    expect(r.state.reached).toEqual(expect.arrayContaining(['meals:10', 'meals:50', 'meals:100', 'bond:1', 'bond:2']));
    expect(milestonesDue(r.state, facts(0.6, 1000, 2)).due[0]!.vars['count']).toBe('1,000');
  });

  it('does not flood a pet that already passed some when milestones arrived', () => {
    const s = normalizeMilestones(undefined, facts(40, 300, 3));
    expect(milestonesDue(s, facts(40.1, 300, 3)).due).toEqual([]);
  });

  it('marks each of your team’s wins once', () => {
    const s = normalizeMilestones(undefined, facts(0));
    const a = winMilestone(s, 'g1', 'Celtics', '112-104');
    expect(a.due).toEqual({ key: 'win:g1', moment: 'big-win', vars: { team: 'Celtics', score: '112-104' } });
    expect(winMilestone(a.state, 'g1', 'Celtics', '112-104').due).toBeNull();
  });
});
