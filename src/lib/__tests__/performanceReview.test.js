import { describe, expect, it } from 'vitest';
import { breakdowns, byMode, outcomesByTag } from '../performanceReview';

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

  it('splits by setup by name, best first, the trades with no strategy last whatever they made', () => {
    const noStrategyWins = [...trades.slice(0, 2), option(80, { openedAt: new Date('2026-04-14T18:10:00Z'), closedAt: new Date('2026-04-14T19:00:00Z') })];

    expect(breakdowns(noStrategyWins, names).bySetup.map((r) => [r.setup, r.netPnl])).toEqual([
      ['Band cross', 20],
      ['No strategy', 80],
    ]);
    expect(breakdowns(trades, names).bySetup[0]).toEqual({
      setup: 'Band cross',
      trades: 2,
      wins: 1,
      losses: 1,
      scratches: 0,
      winRatePct: 50,
      netPnl: 20,
      avgNetPnl: 10,
    });
  });

  it('names a setup whose strategy is not in the list', () => {
    expect(breakdowns([option(5, { strategyId: 'gone' })], names).bySetup[0].setup).toBe('Unknown strategy');
  });

  it('splits by the New York weekday of the fill, leaving out days with no trade', () => {
    const rows = breakdowns(trades, names).byWeekday;

    expect(rows.map((r) => [r.day, r.trades, r.netPnl])).toEqual([
      ['Mon', 1, 30],
      ['Tue', 2, -30],
    ]);
  });

  it('puts a weekend fill on its own row, and skips a trade with no fill time', () => {
    // 2026-04-18 is a Saturday.
    const saturday = option(10, { openedAt: new Date('2026-04-18T14:00:00Z'), closedAt: new Date('2026-04-18T15:00:00Z') });
    const noFill = option(10, { openedAt: null });

    expect(breakdowns([saturday, noFill], names).byWeekday.map((r) => [r.day, r.trades])).toEqual([['Sat', 1]]);
  });

  it('rounds the average to cents and the win rate to a tenth of a percent', () => {
    const rows = breakdowns([option(10), option(10), option(-5)], names);

    // 15 over 3 trades is 5; 2 of 3 is 66.7%.
    expect(rows.overall).toMatchObject({ winRatePct: 66.7, avgNetPnl: 5 });
    expect(breakdowns([option(10), option(0), option(0.01)], names).overall.avgNetPnl).toBe(3.34);
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

  it('puts entries before the open or after the close in an outside bucket', () => {
    // 2026-04-13 08:00 in New York.
    const early = option(10, { openedAt: new Date('2026-04-13T12:00:00Z') });

    expect(breakdowns([early], names).byTimeOfDay.map((r) => [r.start, r.trades])).toEqual([['outside', 1]]);
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

  it('leaves out a trade with both prices but no close, as the other figures do', () => {
    const unclosed = option(10, { closedAt: null });

    expect(breakdowns([unclosed], names).byWeekday).toEqual([]);
    expect(byMode([unclosed], names)).toEqual({});
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

describe('outcomesByTag', () => {
  const t = (id, gross) => option(gross, { id });
  const review = (tradeId, overrides) => ({ tradeId, kind: 'review', emotion: null, mistakes: [], emotionalControl: null, ...overrides });
  const trades = [t('a', -30), t('b', -10), t('c', 20), t('d', 15), t('e', 5)];
  const entries = [
    review('a', { mistakes: ['revenge_trade', 'oversized'], emotion: 'frustrated', emotionalControl: 2 }),
    review('b', { mistakes: ['revenge_trade'], emotion: 'frustrated', emotionalControl: 3 }),
    // A plan entry's emotion counts, and a mistake on two of a trade's entries counts once.
    { tradeId: 'b', kind: 'plan', emotion: 'fomo', mistakes: ['revenge_trade'], emotionalControl: null },
    review('c', { emotion: 'calm', emotionalControl: 8 }),
    review('d', { emotion: 'calm', emotionalControl: 7 }),
    // 'e' has no review at all.
  ];
  const outcomes = outcomesByTag(trades, entries);

  it('totals each mistake over the trades tagged with it, once per trade, most frequent first', () => {
    expect(outcomes.mistakes).toEqual([
      { mistake: 'revenge_trade', trades: 2, wins: 0, losses: 2, scratches: 0, winRatePct: 0, netPnl: -40, avgNetPnl: -20 },
      { mistake: 'oversized', trades: 1, wins: 0, losses: 1, scratches: 0, winRatePct: 0, netPnl: -30, avgNetPnl: -30 },
    ]);
  });

  it('compares with the reviewed trades that had no mistake, and counts the ones never reviewed', () => {
    expect(outcomes.noMistakes).toMatchObject({ trades: 2, netPnl: 35, avgNetPnl: 17.5 });
    expect(outcomes.unreviewed).toBe(1);
  });

  it('totals each emotion, with how many of its trades carried a mistake and which', () => {
    expect(outcomes.emotions).toEqual([
      {
        emotion: 'frustrated',
        trades: 2,
        wins: 0,
        losses: 2,
        scratches: 0,
        winRatePct: 0,
        netPnl: -40,
        avgNetPnl: -20,
        tradesWithMistakes: 2,
        mistakes: [
          { mistake: 'revenge_trade', trades: 2 },
          { mistake: 'oversized', trades: 1 },
        ],
      },
      { emotion: 'calm', trades: 2, wins: 2, losses: 0, scratches: 0, winRatePct: 100, netPnl: 35, avgNetPnl: 17.5, tradesWithMistakes: 0, mistakes: [] },
      { emotion: 'fomo', trades: 1, wins: 0, losses: 1, scratches: 0, winRatePct: 0, netPnl: -10, avgNetPnl: -10, tradesWithMistakes: 1, mistakes: [{ mistake: 'revenge_trade', trades: 1 }] },
    ]);
  });

  it('groups trades by the emotional control rated on their reviews, low to high', () => {
    expect(outcomes.emotionalControl).toEqual([
      { band: 'low (1-3)', trades: 2, wins: 0, losses: 2, scratches: 0, winRatePct: 0, netPnl: -40, avgNetPnl: -20, tradesWithMistakes: 2 },
      { band: 'high (7-10)', trades: 2, wins: 2, losses: 0, scratches: 0, winRatePct: 100, netPnl: 35, avgNetPnl: 17.5, tradesWithMistakes: 0 },
    ]);
  });

  it('averages a trade’s ratings before banding it', () => {
    const rated = outcomesByTag([t('a', 10)], [review('a', { emotionalControl: 3 }), review('a', { emotionalControl: 6 })]);

    // 4.5 is in the middle band.
    expect(rated.emotionalControl.map((r) => r.band)).toEqual(['middle (4-6)']);
  });

  it('rounds the average rating to a whole number before banding it', () => {
    const band = (...ratings) =>
      outcomesByTag([t('a', 10)], ratings.map((emotionalControl) => review('a', { emotionalControl }))).emotionalControl[0].band;

    expect(band(3, 3, 4)).toBe('low (1-3)'); // 3.33
    expect(band(3, 4)).toBe('middle (4-6)'); // 3.5
    expect(band(6, 7)).toBe('high (7-10)'); // 6.5
  });

  it('puts the costlier tag first when two have as many trades, then orders by name', () => {
    const tied = outcomesByTag(
      [t('a', -5), t('b', 20), t('c', -30)],
      [
        review('a', { mistakes: ['oversized'], emotion: 'fomo' }),
        review('b', { mistakes: ['exited_early'], emotion: 'fomo' }),
        review('c', { mistakes: ['moved_stop'], emotion: 'fomo' }),
      ]
    );

    expect(tied.mistakes.map((m) => m.mistake)).toEqual(['moved_stop', 'oversized', 'exited_early']);
    // Every mistake came with fomo once, so the emotion's list is alphabetical.
    expect(tied.emotions[0].mistakes.map((m) => m.mistake)).toEqual(['exited_early', 'moved_stop', 'oversized']);
  });

  it('leaves out a trade that is not closed', () => {
    const open = option(10, { id: 'z', closedAt: null });

    const result = outcomesByTag([open], [review('z', { mistakes: ['oversized'], emotion: 'fomo', emotionalControl: 5 })]);

    expect(result).toEqual({ mistakes: [], noMistakes: null, unreviewed: 0, emotions: [], emotionalControl: [] });
  });

  it('is empty when nothing was tagged', () => {
    expect(outcomesByTag([t('a', 10)], [])).toEqual({ mistakes: [], noMistakes: null, unreviewed: 1, emotions: [], emotionalControl: [] });
  });
});
