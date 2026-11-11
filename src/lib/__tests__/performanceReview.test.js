import { describe, expect, it } from 'vitest';
import { MAX_ENTRIES, MAX_FLAGGED, MAX_NOTE, MAX_TRADES, WORKING_MIN_TRADES, buildReviewFacts, TREND_MIN_TRADES, breakdowns, byMode, outcomesByTag, ruleAdherence, trendFacts, workingGroups } from '../performanceReview';

// A closed long option, 1 contract: gross P/L is (exit - entry) * 100. The
// fill defaults to Monday 2026-04-13, 10:00 New York time.
function option(gross, overrides = {}) {
  return {
    mode: 'live',
    symbol: 'SPY',
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

describe('trendFacts', () => {
  // A trade filled on 2026-04-<day> at 10:00 New York time.
  const onDay = (day, gross, id) =>
    option(gross, {
      id,
      openedAt: new Date(`2026-04-${day}T14:00:00Z`),
      closedAt: new Date(`2026-04-${day}T15:00:00Z`),
    });
  const review = (tradeId, overrides) => ({ tradeId, kind: 'review', emotion: null, mistakes: [], emotionalControl: null, ...overrides });

  describe('mistakeRuns', () => {
    // Trading days 13, 14, 15, 16, 17.
    const days = ['13', '14', '15', '16', '17'];
    const trades = days.map((day) => onDay(day, 10, `t${day}`));
    const tag = (day, mistakes) => review(`t${day}`, { mistakes });

    it('reports a mistake tagged on two or more trading days in a row, each run apart, longest first', () => {
      const entries = [
        tag('13', ['oversized']),
        tag('14', ['oversized', 'moved_stop']),
        tag('15', ['moved_stop']),
        tag('16', ['oversized']),
        tag('17', ['oversized']),
      ];

      expect(trendFacts(trades, entries).mistakeRuns).toEqual([
        { mistake: 'moved_stop', days: 2, from: '2026-04-14', to: '2026-04-15' },
        { mistake: 'oversized', days: 2, from: '2026-04-13', to: '2026-04-14' },
        { mistake: 'oversized', days: 2, from: '2026-04-16', to: '2026-04-17' },
      ]);
    });

    it('does not report a mistake seen on one day only, and takes a day they did not trade as no gap', () => {
      // The 13th, then Friday the 17th and Monday the 20th: the days between had no trade.
      const friday = onDay('17', 10, 'fri');
      const monday = onDay('20', 10, 'mon');
      const entries = [review('fri', { mistakes: ['oversized'] }), review('mon', { mistakes: ['oversized'] }), tag('13', ['moved_stop'])];

      const runs = trendFacts([...trades.slice(0, 1), friday, monday], entries).mistakeRuns;

      expect(runs).toEqual([{ mistake: 'oversized', days: 2, from: '2026-04-17', to: '2026-04-20' }]);
    });

    it('counts a day once however many of its trades carry the mistake', () => {
      const second = onDay('13', -5, 'second');
      const entries = [tag('13', ['oversized']), review('second', { mistakes: ['oversized'] })];

      expect(trendFacts([...trades.slice(0, 1), second], entries).mistakeRuns).toEqual([]);
    });
  });

  describe('weeks', () => {
    it('gives each New York week, Monday first, oldest first, with its results and tags', () => {
      const trades = [onDay('13', 20, 'a'), onDay('15', -10, 'b'), onDay('21', 30, 'c')];
      const entries = [
        review('a', { emotionalControl: 8 }),
        review('b', { mistakes: ['oversized', 'moved_stop'], emotionalControl: 4 }),
        review('c', { emotionalControl: 7 }),
      ];

      expect(trendFacts(trades, entries).weeks).toEqual([
        { week: '2026-04-13', trades: 2, wins: 1, losses: 1, scratches: 0, winRatePct: 50, netPnl: 10, avgNetPnl: 5, reviewedTrades: 2, mistakesPerTrade: 1, avgControl: 6 },
        { week: '2026-04-20', trades: 1, wins: 1, losses: 0, scratches: 0, winRatePct: 100, netPnl: 30, avgNetPnl: 30, reviewedTrades: 1, mistakesPerTrade: 0, avgControl: 7 },
      ]);
    });

    it('puts a Sunday fill in the week that began on the Monday before it', () => {
      // 2026-04-19 is a Sunday.
      expect(trendFacts([onDay('19', 5, 'a')], []).weeks.map((w) => w.week)).toEqual(['2026-04-13']);
    });

    it('names a week by a Monday in the month before, across a month boundary', () => {
      // 2026-05-01 is a Friday, in the week of Monday 2026-04-27.
      const trades = [onDay('30', 5, 'a'), { ...onDay('30', 5, 'b'), openedAt: new Date('2026-05-01T14:00:00Z'), closedAt: new Date('2026-05-01T15:00:00Z') }];

      expect(trendFacts(trades, []).weeks.map((w) => [w.week, w.trades])).toEqual([['2026-04-27', 2]]);
    });

    it('counts mistakes per reviewed trade, and has none to count when no trade was reviewed', () => {
      const trades = [onDay('13', 5, 'a'), onDay('14', 5, 'b'), onDay('15', 5, 'c')];
      const entries = [review('a', { mistakes: ['oversized'] })];

      expect(trendFacts(trades, entries).weeks[0]).toMatchObject({ trades: 3, reviewedTrades: 1, mistakesPerTrade: 1 });
      expect(trendFacts(trades, []).weeks[0]).toMatchObject({ trades: 3, reviewedTrades: 0, mistakesPerTrade: null });
    });

    it('has no average control for a week with no rating', () => {
      expect(trendFacts([onDay('13', 5, 'a')], []).weeks[0].avgControl).toBeNull();
    });
  });

  it('has nothing to report for no trades', () => {
    expect(trendFacts([], [])).toEqual({ mistakeRuns: [], weeks: [], trend: null });
  });

  describe('trend', () => {
    // Ten trades on ten trading days: the first five lose with a mistake, the last five win clean.
    const days = ['01', '02', '03', '06', '07', '08', '09', '10', '13', '14'];
    const trades = days.map((day, i) => onDay(day, i < 5 ? -10 : 10, `t${i}`));
    const entries = trades.map((trade, i) => review(trade.id, { mistakes: i < 5 ? ['oversized'] : [] }));

    it('compares the first half of the trades with the second', () => {
      const { trend } = trendFacts(trades, entries);

      expect(trend.first).toMatchObject({ from: '2026-04-01', to: '2026-04-07', trades: 5, netPnl: -50, winRatePct: 0, mistakesPerTrade: 1 });
      expect(trend.second).toMatchObject({ from: '2026-04-08', to: '2026-04-14', trades: 5, netPnl: 50, winRatePct: 100, mistakesPerTrade: 0 });
    });

    it('gives the odd trade to the first half', () => {
      const { trend } = trendFacts([...trades, onDay('15', 1, 'extra')], entries);

      expect([trend.first.trades, trend.second.trades]).toEqual([6, 5]);
    });

    it('says nothing below the minimum number of trades', () => {
      expect(TREND_MIN_TRADES).toBe(10);
      expect(trendFacts(trades.slice(0, 9), entries).trend).toBeNull();
    });
  });
});

// An option trade that kept every rule: filled at 10:00 New York time (outside
// the lockouts), one contract, a plan written first, a strategy, a planned exit.
const clean = (gross, overrides = {}) =>
  option(gross, {
    id: 'clean',
    strategyId: 's1',
    planWrittenAt: new Date('2026-04-13T13:00:00Z'),
    unmetRuleCount: 0,
    exitReason: 'target',
    ...overrides,
  });

describe('ruleAdherence', () => {
  // 13:00 New York time is inside the 11:00-14:00 lockout.
  const inLockout = { openedAt: new Date('2026-04-13T17:00:00Z'), closedAt: new Date('2026-04-13T18:00:00Z') };

  it('passes the dashboard’s adherence figures through', () => {
    const { checks } = ruleAdherence([clean(10), clean(-5, inLockout)]);

    expect(checks.trades).toBe(2);
    expect(checks.window).toEqual({ ok: 1, missed: 1, cost: -5 });
  });

  it('flags the trades that broke a rule, with which ones, newest first', () => {
    const broke = clean(-20, {
      ...inLockout,
      quantity: 3,
      exitPrice: 0.8,
      initialStop: 0.9,
      strategyId: null,
      exitReason: 'felt_heavy',
    });
    const later = clean(-5, { ...inLockout, openedAt: new Date('2026-04-14T17:00:00Z'), closedAt: new Date('2026-04-14T18:00:00Z') });

    const { flagged, flaggedTrades, omitted } = ruleAdherence([clean(10), broke, later]);

    expect(flaggedTrades).toBe(2);
    expect(omitted).toBe(0);
    expect(flagged).toEqual([
      { date: '2026-04-14', symbol: 'SPY', optionType: 'call', quantity: 1, netPnl: -5, failed: ['Window'] },
      { date: '2026-04-13', symbol: 'SPY', optionType: 'call', quantity: 3, netPnl: -60, failed: ['Window', 'Size', 'Plan', 'Stop', 'Exit'] },
    ]);
  });

  it('flags nothing for a clean trade, and leaves out stocks, which the checks do not judge', () => {
    const stock = clean(-5, { assetClass: 'stock', ...inLockout, strategyId: null });

    expect(ruleAdherence([clean(10), stock])).toMatchObject({ flagged: [], flaggedTrades: 0, omitted: 0 });
  });

  it('keeps the newest MAX_FLAGGED and says how many it left out', () => {
    const many = Array.from({ length: MAX_FLAGGED + 3 }, (_, i) =>
      clean(-1, { ...inLockout, openedAt: new Date(Date.UTC(2026, 3, 1, 17) + i * 3_600_000 * 24), closedAt: new Date(Date.UTC(2026, 3, 1, 18) + i * 3_600_000 * 24) })
    );

    const result = ruleAdherence(many);

    expect(result.flagged).toHaveLength(MAX_FLAGGED);
    expect(result).toMatchObject({ flaggedTrades: MAX_FLAGGED + 3, omitted: 3 });
  });
});

describe('workingGroups', () => {
  const names = new Map([['s1', 'Band cross'], ['s2', 'Other']]);
  const day = (n) => ({
    openedAt: new Date(`2026-04-${String(n).padStart(2, '0')}T14:00:00Z`),
    closedAt: new Date(`2026-04-${String(n).padStart(2, '0')}T15:00:00Z`),
  });
  // Five winning Band cross trades, all clean; four losing Other trades.
  const winners = Array.from({ length: WORKING_MIN_TRADES }, (_, i) => clean(10, { id: `w${i}`, ...day(13 + i) }));
  const losers = Array.from({ length: 4 }, (_, i) => clean(-10, { id: `l${i}`, strategyId: 's2', ...day(20 + i) }));
  const entries = winners.map((trade) => ({ tradeId: trade.id, kind: 'review', mistakes: [] }));

  it('lists setups, weekdays, and calls or puts with enough trades and a profit, with how well they were executed', () => {
    const rows = workingGroups([...winners, ...losers], entries, names);

    expect(rows.find((r) => r.kind === 'setup')).toEqual({
      kind: 'setup',
      name: 'Band cross',
      trades: 5,
      wins: 5,
      losses: 0,
      scratches: 0,
      winRatePct: 100,
      netPnl: 50,
      avgNetPnl: 10,
      disciplinePct: 100,
      cleanReviewPct: 100,
    });
    expect(rows.find((r) => r.name === 'Other')).toBeUndefined();
  });

  it('leaves out a group with too few trades or no profit', () => {
    expect(workingGroups(winners.slice(0, WORKING_MIN_TRADES - 1), entries, names)).toEqual([]);
    expect(workingGroups(losers.concat(losers), entries, names)).toEqual([]);
  });

  it('says how much of the group’s reviewed trades were clean, and nothing when none was reviewed', () => {
    const marked = [{ tradeId: 'w0', kind: 'review', mistakes: ['oversized'] }, ...entries.slice(1)];

    expect(workingGroups(winners, marked, names).find((r) => r.kind === 'setup').cleanReviewPct).toBe(80);
    expect(workingGroups(winners, [], names).find((r) => r.kind === 'setup').cleanReviewPct).toBeNull();
  });

  it('gives no discipline score when no check applied (a stock trade)', () => {
    const stocks = winners.map((trade) => ({ ...trade, assetClass: 'stock', optionType: null }));

    expect(workingGroups(stocks, entries, names).find((r) => r.kind === 'setup').disciplinePct).toBeNull();
  });

  it('orders by net P/L, best first, across the kinds', () => {
    const others = Array.from({ length: 5 }, (_, i) => clean(20, { id: `o${i}`, strategyId: 's2', ...day(13 + i) }));

    const rows = workingGroups([...winners, ...others], entries, names);

    // Calls (all ten trades) 150, Other 100, Band cross 50.
    expect(rows.filter((r) => r.kind !== 'weekday').map((r) => [r.kind, r.name, r.netPnl])).toEqual([
      ['call or put', 'call', 150],
      ['setup', 'Other', 100],
      ['setup', 'Band cross', 50],
    ]);
  });

  it('lists a call or put group, and no row for stocks, which have no option type', () => {
    expect(workingGroups(winners, entries, names).find((r) => r.kind === 'call or put')).toMatchObject({ name: 'call', trades: 5, netPnl: 50 });

    const stocks = winners.map((trade) => ({ ...trade, assetClass: 'stock', optionType: null }));
    expect(workingGroups(stocks, entries, names).some((r) => r.kind === 'call or put')).toBe(false);
  });

  it('groups by the New York weekday of the fill', () => {
    // Five Mondays; the last fill is Monday 21:30 in New York, which is Tuesday in UTC.
    const fills = ['2026-04-06T14:00:00Z', '2026-04-13T14:00:00Z', '2026-04-20T14:00:00Z', '2026-04-27T14:00:00Z', '2026-05-05T01:30:00Z'];
    const mondays = fills.map((at, i) => clean(10, { id: `m${i}`, openedAt: new Date(at), closedAt: new Date(new Date(at).getTime() + 3_600_000) }));

    expect(workingGroups(mondays, [], names).find((r) => r.kind === 'weekday')).toMatchObject({ name: 'Mon', trades: 5 });
  });

  it('names a trade with no strategy, or one whose strategy is gone', () => {
    const none = winners.map((trade) => ({ ...trade, strategyId: null }));
    const gone = winners.map((trade) => ({ ...trade, strategyId: 'deleted' }));

    expect(workingGroups(none, entries, names).find((r) => r.kind === 'setup').name).toBe('No strategy');
    expect(workingGroups(gone, entries, names).find((r) => r.kind === 'setup').name).toBe('Unknown strategy');
  });
});

describe('buildReviewFacts', () => {
  const strategies = [{ id: 's1', name: 'Band cross', rules: [{ kind: 'edge', text: 'Cross on 15m' }] }];
  const range = { label: 'Last 7 days', from: '2026-04-07', to: '2026-04-14' };
  const plan = {
    tradeDate: '2026-04-13',
    ltfDirection: 'bullish',
    ltfFib50: 101,
    ltfFib100: 103,
    htfDirection: null,
    htfFib50: null,
    htfFib100: null,
    notes: 'Wait for the cross.',
  };
  const day = (n) => ({
    openedAt: new Date(`2026-04-${String(n).padStart(2, '0')}T14:00:00Z`),
    closedAt: new Date(`2026-04-${String(n).padStart(2, '0')}T15:00:00Z`),
  });
  const build = (overrides) =>
    buildReviewFacts({ trades: [], entries: [], dailyPlans: [], strategies, range, ...overrides });

  it('passes the range through and lists the strategies with their rules', () => {
    const facts = build({});

    expect(facts.range).toEqual(range);
    expect(facts.strategies).toEqual([{ name: 'Band cross', rules: [{ kind: 'edge', text: 'Cross on 15m' }] }]);
    expect(facts).toMatchObject({ modes: {}, trades: [], tradesOmitted: 0, journalEntries: [], journalEntriesOmitted: 0, dailyPlans: [] });
  });

  it('breaks each mode down apart', () => {
    const facts = build({ trades: [clean(10, { id: 'a', ...day(13) }), clean(-5, { id: 'b', mode: 'backtest', ...day(14) })] });

    expect(Object.keys(facts.modes)).toEqual(['live', 'backtest']);
    expect(facts.modes.live.overall.netPnl).toBe(10);
    expect(facts.modes.backtest.overall.netPnl).toBe(-5);
    expect(Object.keys(facts.modes.live)).toEqual(
      expect.arrayContaining(['overall', 'bySetup', 'byWeekday', 'byTimeOfDay', 'callsVsPuts', 'outcomes', 'trend', 'adherence', 'working'])
    );
  });

  it('lists each trade oldest first with a ref, its setup by name, and New York fill times', () => {
    const later = clean(-5, { id: 'later', strategyId: null, ...day(14), strike: 600, expiration: '2026-04-14' });
    const earlier = clean(10, { id: 'earlier', strategyId: 's1', ...day(13), initialStop: 0.8, target: 1.5 });

    const { trades } = build({ trades: [later, earlier] });

    expect(trades.map((t) => t.ref)).toEqual([1, 2]);
    expect(trades[0]).toMatchObject({
      ref: 1,
      mode: 'live',
      symbol: 'SPY',
      assetClass: 'option',
      direction: 'long',
      optionType: 'call',
      setup: 'Band cross',
      quantity: 1,
      entryPrice: 1,
      exitPrice: 1.1,
      stop: 0.8,
      target: 1.5,
      exitReason: 'target',
      filledAt: '2026-04-13 10:00',
      closedAt: '2026-04-13 11:00',
      netPnl: 10,
      r: 0.5,
    });
    expect(trades[1]).toMatchObject({ ref: 2, setup: 'No strategy', strike: 600, expiration: '2026-04-14', r: null });
  });

  it('calls a trade’s setup the same thing as the figures do', () => {
    const none = clean(5, { id: 'n', strategyId: null, ...day(13) });
    const gone = clean(5, { id: 'g', strategyId: 'deleted', ...day(14) });

    expect(build({ trades: [none, gone] }).trades.map((t) => t.setup)).toEqual(['No strategy', 'Unknown strategy']);
  });

  it('gives the stop rule and planned entry, leaves out an open trade, and shows a winter fill in standard time', () => {
    const winter = clean(5, {
      id: 'w',
      stopRule: 'S2',
      plannedEntry: 0.95,
      openedAt: new Date('2026-01-05T15:00:00Z'),
      closedAt: new Date('2026-01-05T16:00:00Z'),
    });
    const open = clean(5, { id: 'o', ...day(14), exitPrice: null, closedAt: null });

    const { trades } = build({ trades: [winter, open] });

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ stopRule: 'S2', plannedEntry: 0.95, filledAt: '2026-01-05 10:00', closedAt: '2026-01-05 11:00' });
  });

  it('keeps the newest MAX_TRADES trades and says how many it left out', () => {
    const trades = Array.from({ length: MAX_TRADES + 2 }, (_, i) =>
      clean(1, {
        id: `t${i}`,
        openedAt: new Date(Date.UTC(2026, 0, 1, 14) + i * 86_400_000),
        closedAt: new Date(Date.UTC(2026, 0, 1, 15) + i * 86_400_000),
      })
    );

    const facts = build({ trades });

    expect(facts.trades).toHaveLength(MAX_TRADES);
    expect(facts.tradesOmitted).toBe(2);
    // The figures still cover every trade.
    expect(facts.modes.live.overall.trades).toBe(MAX_TRADES + 2);
  });

  it('links each journal entry to its trade by ref, dropping the entries of trades it left out', () => {
    const trades = Array.from({ length: MAX_TRADES + 1 }, (_, i) =>
      clean(1, {
        id: `t${i}`,
        openedAt: new Date(Date.UTC(2026, 0, 1, 14) + i * 86_400_000),
        closedAt: new Date(Date.UTC(2026, 0, 1, 15) + i * 86_400_000),
      })
    );
    const entries = [
      { tradeId: 't0', kind: 'review', mode: 'live', emotion: 'fomo', mistakes: [], emotionalControl: 4, notes: 'Oldest, left out.', createdAt: new Date('2026-01-01T22:00:00Z') },
      { tradeId: `t${MAX_TRADES}`, kind: 'review', mode: 'live', emotion: 'calm', mistakes: ['oversized'], emotionalControl: 8, notes: 'Newest.', createdAt: new Date('2026-04-13T22:00:00Z') },
      { tradeId: null, kind: 'thesis', mode: 'backtest', symbol: 'SPY', emotion: null, mistakes: [], emotionalControl: null, notes: 'No trade.', createdAt: new Date('2026-04-12T22:00:00Z') },
    ];

    const { journalEntries } = build({ trades, entries });

    expect(build({ trades, entries }).journalEntriesOmitted).toBe(1);
    expect(journalEntries).toEqual([
      { ref: null, date: '2026-04-12', kind: 'thesis', mode: 'backtest', symbol: 'SPY', emotion: null, mistakes: [], emotionalControl: null, notes: 'No trade.' },
      { ref: MAX_TRADES, date: '2026-04-13', kind: 'review', mode: 'live', symbol: null, emotion: 'calm', mistakes: ['oversized'], emotionalControl: 8, notes: 'Newest.' },
    ]);
  });

  it('caps the entries at the newest MAX_ENTRIES, and shortens a long note', () => {
    const entries = Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => ({
      tradeId: null,
      kind: 'thesis',
      symbol: 'SPY',
      emotion: null,
      mistakes: [],
      emotionalControl: null,
      notes: i === MAX_ENTRIES ? 'x'.repeat(MAX_NOTE + 50) : 'n',
      createdAt: new Date(Date.UTC(2026, 0, 1, 12) + i * 3_600_000),
    }));

    const facts = build({ entries });

    expect(facts.journalEntries).toHaveLength(MAX_ENTRIES);
    expect(facts.journalEntriesOmitted).toBe(1);
    expect(facts.journalEntries.at(-1).notes).toBe(`${'x'.repeat(MAX_NOTE)}…`);
  });

  it('gives the higher-timeframe fib when the day has one', () => {
    const withHtf = { ...plan, htfDirection: 'bearish', htfFib50: 98, htfFib100: 95 };

    const { dailyPlans } = build({ trades: [clean(10, { id: 'a', ...day(13) })], dailyPlans: [withHtf] });

    expect(dailyPlans[0].higherTimeframe).toEqual({ direction: 'bearish', fib50: 98, fib100: 95 });
  });

  it('lists the daily plans of the days that have a trade', () => {
    const facts = build({
      trades: [clean(10, { id: 'a', ...day(13) })],
      dailyPlans: [plan, { ...plan, tradeDate: '2026-04-09' }],
    });

    expect(facts.dailyPlans).toEqual([
      { date: '2026-04-13', lowerTimeframe: { direction: 'bullish', fib50: 101, fib100: 103 }, higherTimeframe: null, notes: 'Wait for the cross.' },
    ]);
  });
});
