import { describe, expect, it } from 'vitest';
import { mistakeLedger } from '../mistakeLedger';

// A closed long with 1R = $100 (100 shares, $1 to the stop), closed for `r`.
function closedTrade(r, mistakes = []) {
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
    mistakes,
  };
}

describe('mistakeLedger', () => {
  it('totals and averages the R of the trades tagged with each mistake', () => {
    const { mistakes } = mistakeLedger([
      closedTrade(-2, ['moved_stop']),
      closedTrade(-1, ['moved_stop', 'oversized']),
      closedTrade(0.5, ['exited_early']),
    ]);

    expect(mistakes).toEqual([
      { mistake: 'moved_stop', trades: 2, totalR: -3, averageR: -1.5 },
      { mistake: 'oversized', trades: 1, totalR: -1, averageR: -1 },
      { mistake: 'exited_early', trades: 1, totalR: 0.5, averageR: 0.5 },
    ]);
  });

  it('puts the costliest mistake first', () => {
    const { mistakes } = mistakeLedger([
      closedTrade(-0.5, ['entered_late']),
      closedTrade(-3, ['revenge_trade']),
    ]);

    expect(mistakes.map((row) => row.mistake)).toEqual(['revenge_trade', 'entered_late']);
  });

  it('compares against trades with no mistakes tagged', () => {
    const { baseline } = mistakeLedger([
      closedTrade(2),
      closedTrade(-1),
      closedTrade(-2, ['moved_stop']),
    ]);

    expect(baseline).toEqual({ trades: 2, averageR: 0.5 });
  });

  it('has no baseline average when every trade had a mistake', () => {
    expect(mistakeLedger([closedTrade(-1, ['oversized'])]).baseline).toEqual({ trades: 0, averageR: null });
  });

  it('counts a trade once per mistake, however many entries tagged it', () => {
    const { mistakes } = mistakeLedger([closedTrade(-1, ['moved_stop', 'moved_stop'])]);

    expect(mistakes).toEqual([{ mistake: 'moved_stop', trades: 1, totalR: -1, averageR: -1 }]);
  });

  it('skips trades without an R, such as ones not closed yet', () => {
    const open = { ...closedTrade(0, ['moved_stop']), exitPrice: null, closedAt: null };

    expect(mistakeLedger([open])).toEqual({ mistakes: [], baseline: { trades: 0, averageR: null }, trades: 0 });
  });

  it('reports how many closed trades it counted', () => {
    expect(mistakeLedger([closedTrade(1), closedTrade(-1, ['oversized'])]).trades).toBe(2);
  });
});
