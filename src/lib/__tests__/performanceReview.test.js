import { describe, expect, it } from 'vitest';
import { breakdowns, byMode } from '../performanceReview';

// A closed long option, 1 contract: gross P/L is (exit - entry) * 100. The
// fill defaults to Monday 2026-04-13, 10:00 New York time.
function option(gross, overrides = {}) {
  return {
    mode: 'live',
    direction: 'long',
    assetClass: 'option',
    optionType: 'call',
    quantity: 1,
    multiplier: 100,
    entryPrice: 1,
    exitPrice: 1 + gross / 100,
    fees: 0,
    strategyId: null,
    openedAt: new Date('2026-04-13T14:00:00Z'),
    closedAt: new Date('2026-04-13T15:00:00Z'),
    ...overrides,
  };
}

describe('breakdowns', () => {
  const names = new Map([['s1', 'Band cross']]);
  const trades = [
    option(30, { strategyId: 's1' }),
    option(-10, { strategyId: 's1', openedAt: new Date('2026-04-14T14:40:00Z'), closedAt: new Date('2026-04-14T15:00:00Z') }),
    option(-20, { optionType: 'put', openedAt: new Date('2026-04-14T18:10:00Z'), closedAt: new Date('2026-04-14T19:00:00Z') }),
  ];

  it('summarizes everything in the compact shape the coach reads', () => {
    expect(breakdowns(trades, names).overall).toEqual({
      trades: 3,
      wins: 1,
      losses: 2,
      scratches: 0,
      winRatePct: 33.3,
      netPnl: 0,
      avgNetPnl: 0,
    });
  });

  it('splits by setup by name, the trades with no strategy last', () => {
    expect(breakdowns(trades, names).bySetup).toEqual([
      { setup: 'Band cross', trades: 2, wins: 1, losses: 1, scratches: 0, winRatePct: 50, netPnl: 20, avgNetPnl: 10 },
      { setup: 'No strategy', trades: 1, wins: 0, losses: 1, scratches: 0, winRatePct: 0, netPnl: -20, avgNetPnl: -20 },
    ]);
  });

  it('splits by the New York weekday of the fill, leaving out days with no trade', () => {
    const rows = breakdowns(trades, names).byWeekday;

    expect(rows.map((r) => [r.day, r.trades, r.netPnl])).toEqual([
      ['Mon', 1, 30],
      ['Tue', 2, -30],
    ]);
  });

  it('splits by half hour of the fill, leaving out empty buckets', () => {
    const rows = breakdowns(trades, names).byTimeOfDay;

    // 14:00Z and 14:40Z are 10:00 and 10:40 in New York; 18:10Z is 14:10.
    expect(rows.map((r) => [r.start, r.trades])).toEqual([
      ['10:00', 1],
      ['10:30', 1],
      ['14:00', 1],
    ]);
  });

  it('splits calls from puts, leaving out a side with no trade', () => {
    expect(breakdowns(trades, names).callsVsPuts.map((r) => [r.type, r.trades, r.netPnl])).toEqual([
      ['call', 2, 20],
      ['put', 1, -20],
    ]);
    expect(breakdowns([option(5)], names).callsVsPuts.map((r) => r.type)).toEqual(['call']);
  });

  it('counts only closed trades with a P/L', () => {
    const open = option(10, { exitPrice: null, closedAt: null });

    expect(breakdowns([open], names).overall.trades).toBe(0);
    expect(breakdowns([], names).overall).toMatchObject({ trades: 0, winRatePct: null, avgNetPnl: null });
  });
});

describe('byMode', () => {
  it('breaks each mode down apart, in live, paper, backtest order, leaving out modes with no trade', () => {
    const trades = [option(10, { mode: 'backtest' }), option(-5, { mode: 'live' }), option(7, { mode: 'live' })];

    const modes = byMode(trades, new Map());

    expect(Object.keys(modes)).toEqual(['live', 'backtest']);
    expect(modes.live.overall.netPnl).toBe(2);
    expect(modes.backtest.overall.netPnl).toBe(10);
  });
});
