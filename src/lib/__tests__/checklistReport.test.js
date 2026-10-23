import { describe, expect, it } from 'vitest';
import { checklistReport } from '../checklistReport';

const VOLUME = '00000000-0000-4000-8000-00000000000a';
const FIRST_BAR = '00000000-0000-4000-8000-00000000000b';

// A closed long with 1R = $100 (100 shares, $1 to the stop), closed for `r`,
// with the checklist answered as `checks` ({ ruleId, ruleText, met }).
function closedTrade(r, checks) {
  return {
    direction: 'long',
    quantity: 100,
    multiplier: 1,
    entryPrice: 50,
    initialStop: 49,
    exitPrice: 50 + r,
    fees: 0,
    openedAt: new Date('2026-10-19T14:00:00Z'),
    closedAt: new Date('2026-10-20T15:00:00Z'),
    ruleChecks: checks,
  };
}

const check = (ruleId, met, ruleText = ruleId === VOLUME ? 'Volume rising' : 'Not the first impulse bar') => ({
  ruleId,
  ruleText,
  met,
});

describe('checklistReport', () => {
  it('compares trades that met every rule against trades entered anyway', () => {
    const report = checklistReport([
      closedTrade(2, [check(VOLUME, true), check(FIRST_BAR, true)]),
      closedTrade(1, [check(VOLUME, true), check(FIRST_BAR, true)]),
      closedTrade(-1, [check(VOLUME, false), check(FIRST_BAR, true)]),
    ]);

    expect(report.followed).toEqual({ trades: 2, totalR: 3, averageR: 1.5 });
    expect(report.broken).toEqual({ trades: 1, totalR: -1, averageR: -1 });
    expect(report.trades).toBe(3);
  });

  it('shows, per rule, how often it was skipped and the average R when skipped and when met', () => {
    const { rules } = checklistReport([
      closedTrade(2, [check(VOLUME, true), check(FIRST_BAR, true)]),
      closedTrade(-1, [check(VOLUME, false), check(FIRST_BAR, true)]),
      closedTrade(-2, [check(VOLUME, false), check(FIRST_BAR, false)]),
    ]);

    expect(rules).toEqual([
      { ruleId: VOLUME, ruleText: 'Volume rising', checked: 3, skipped: 2, skippedAverageR: -1.5, metAverageR: 2 },
      {
        ruleId: FIRST_BAR,
        ruleText: 'Not the first impulse bar',
        checked: 3,
        skipped: 1,
        skippedAverageR: -2,
        metAverageR: 0.5,
      },
    ]);
  });

  it('puts the most skipped rule first', () => {
    const { rules } = checklistReport([
      closedTrade(1, [check(VOLUME, true), check(FIRST_BAR, false)]),
      closedTrade(1, [check(VOLUME, true), check(FIRST_BAR, false)]),
    ]);

    expect(rules.map((rule) => rule.ruleId)).toEqual([FIRST_BAR, VOLUME]);
  });

  it("names a rule by its latest wording, since a rule's text can be edited", () => {
    const { rules } = checklistReport([
      closedTrade(1, [check(VOLUME, true, 'Volume up')]),
      closedTrade(1, [check(VOLUME, true, 'Volume rising on the trend')]),
    ]);

    expect(rules).toHaveLength(1);
    expect(rules[0].ruleText).toBe('Volume rising on the trend');
  });

  it('keeps deleted rules apart by their text', () => {
    const { rules } = checklistReport([
      closedTrade(1, [check(null, false, 'Old rule A'), check(null, true, 'Old rule B')]),
    ]);

    expect(rules.map((rule) => [rule.ruleText, rule.skipped])).toEqual([
      ['Old rule A', 1],
      ['Old rule B', 0],
    ]);
  });

  it('gives null averages where there are no trades to average', () => {
    const report = checklistReport([closedTrade(1, [check(VOLUME, true)])]);

    expect(report.broken).toEqual({ trades: 0, totalR: 0, averageR: null });
    expect(report.rules[0].skippedAverageR).toBeNull();
  });

  it('counts only closed trades with an R that went through a checklist', () => {
    const open = { ...closedTrade(1, [check(VOLUME, true)]), exitPrice: null, closedAt: null };

    const report = checklistReport([open, closedTrade(1, []), closedTrade(2, [check(VOLUME, true)])]);

    expect(report.trades).toBe(1);
    expect(report.followed.trades).toBe(1);
  });
});
