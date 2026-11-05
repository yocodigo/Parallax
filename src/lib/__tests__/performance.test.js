import { describe, expect, it } from 'vitest';
import { byUnderlying, callsVsPuts, equityCurve, GRAD_N, graduation, modeComparison, monthlySummary, rDistribution, rollingExpectancy, summarize, timeOfDay } from '../performance';

// A closed long option, 1 contract: gross P/L is (exit - entry) * 100.
function option(gross, fees = 0, closedAt = '2026-04-13T20:00:00Z') {
  return {
    direction: 'long',
    quantity: 1,
    multiplier: 100,
    entryPrice: 1,
    exitPrice: 1 + gross / 100,
    fees,
    openedAt: new Date('2026-04-13T14:00:00Z'),
    closedAt: new Date(closedAt),
  };
}

describe('summarize', () => {
  const trades = [option(30, 1), option(10, 1), option(-20, 1), option(0, 1), option(-10, 1)];

  it('counts wins, losses, and scratches by gross P/L', () => {
    const s = summarize(trades);
    expect([s.trades, s.wins, s.losses, s.scratches]).toEqual([5, 2, 2, 1]);
    expect(s.winRate).toBe(0.4);
    expect(s.lossRate).toBe(0.4);
  });

  it('counts a round trip at the same premium as a scratch despite floating-point error', () => {
    // 0.1 + 0.2 is 0.30000000000000004, so the raw gross is a hair above zero.
    const flat = { ...option(0), entryPrice: 0.3, exitPrice: 0.1 + 0.2 };
    expect(summarize([flat]).scratches).toBe(1);
  });

  it('reports gross and net totals and fees, to the cent', () => {
    const s = summarize(trades);
    expect([s.grossPnl, s.fees, s.netPnl]).toEqual([10, 5, 5]);
    const cents = summarize([option(0.1, 0.01), option(0.2, 0.02)]);
    expect([cents.grossPnl, cents.fees, cents.netPnl]).toEqual([0.3, 0.03, 0.27]);
  });

  it('averages wins and losses in dollars, with payoff ratio and breakeven win rate', () => {
    const s = summarize(trades);
    expect(s.avgWin).toBe(20);
    expect(s.avgLoss).toBe(-15);
    expect(s.payoffRatio).toBeCloseTo(20 / 15);
    expect(s.breakevenWinRate).toBeCloseTo(15 / 35);
  });

  it('computes profit factor gross, and net by adding every fee to the losses', () => {
    const s = summarize(trades);
    expect(s.profitFactor).toBeCloseTo(40 / 30);
    expect(s.netProfitFactor).toBeCloseTo(40 / 35);
  });

  it('computes expectancy per trade, gross and net', () => {
    const s = summarize(trades);
    expect(s.expectancy).toBe(2);
    expect(s.netExpectancy).toBe(1);
  });

  it('leaves a ratio null when there is nothing to divide by', () => {
    const s = summarize([option(10)]);
    expect([s.avgLoss, s.payoffRatio, s.breakevenWinRate, s.profitFactor]).toEqual([null, null, null, null]);
    const none = summarize([]);
    expect([none.trades, none.winRate, none.expectancy, none.netPnl]).toEqual([0, null, null, 0]);
  });

  it('leaves out trades that are not closed', () => {
    expect(summarize([...trades, { ...option(50), closedAt: null }]).trades).toBe(5);
  });

  it('leaves out a closed trade with no exit price, rather than counting it a scratch', () => {
    expect(summarize([...trades, { ...option(50), exitPrice: null }]).trades).toBe(5);
  });
});

describe('equityCurve', () => {
  it('runs net P/L in closing order, with drawdown below the running peak', () => {
    const curve = equityCurve([
      option(-10, 1, '2026-04-15T20:00:00Z'),
      option(30, 1, '2026-04-13T20:00:00Z'),
      option(-50, 1, '2026-04-14T20:00:00Z'),
    ]);
    expect(curve.map((p) => p.cumulative)).toEqual([29, -22, -33]);
    expect(curve.map((p) => p.drawdown)).toEqual([0, 51, 62]);
    expect(curve[0].closedAt).toEqual(new Date('2026-04-13T20:00:00Z'));
  });

  it('sorts closing times given as ISO strings, as they arrive from JSON', () => {
    const curve = equityCurve([
      { ...option(-50), closedAt: '2026-04-14T20:00:00Z' },
      { ...option(30), closedAt: '2026-04-13T20:00:00Z' },
    ]);
    expect(curve.map((p) => p.cumulative)).toEqual([30, -20]);
  });

  it('counts a loss from the start as drawdown, since the peak begins at zero', () => {
    expect(equityCurve([option(-10)])[0].drawdown).toBe(10);
  });
});

describe('monthlySummary', () => {
  it('summarizes each New York month of closing, oldest first', () => {
    const months = monthlySummary([
      option(20, 1, '2026-02-10T20:00:00Z'),
      option(-10, 1, '2026-01-15T20:00:00Z'),
      option(30, 1, '2026-01-20T20:00:00Z'),
    ]);
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02']);
    expect([months[0].trades, months[0].grossPnl, months[0].netPnl]).toEqual([2, 20, 18]);
    expect([months[1].trades, months[1].netPnl]).toEqual([1, 19]);
  });

  it('files a close on the evening of the last day in New York under that month', () => {
    // 01:30 UTC on Feb 1 is 20:30 on Jan 31 in New York.
    const [month] = monthlySummary([option(10, 0, '2026-02-01T01:30:00Z')]);
    expect(month.month).toBe('2026-01');
  });

  it('leaves out trades that are not closed', () => {
    expect(monthlySummary([{ ...option(10), closedAt: null }])).toEqual([]);
    expect(monthlySummary([{ ...option(10), exitPrice: null }])).toEqual([]);
  });
});

describe('rollingExpectancy', () => {
  // Closing one hour apart, so the order is the order given.
  const series = (grosses) =>
    grosses.map((g, i) => option(g, 1, `2026-04-13T${String(14 + i).padStart(2, '0')}:00:00Z`));

  it('averages the last N trades after each close, gross and net, once N have closed', () => {
    const points = rollingExpectancy(series([10, 20, -30, 40]), 3);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.expectancy)).toEqual([0, 10]);
    expect(points.map((p) => p.netExpectancy)).toEqual([-1, 9]);
    expect(points[0].closedAt).toEqual(new Date('2026-04-13T16:00:00Z'));
  });

  it('sorts by closing time, including times given as ISO strings', () => {
    const [a, b, c] = series([30, -30, 60]);
    const points = rollingExpectancy([c, a, b].map((t) => ({ ...t, closedAt: t.closedAt.toISOString() })), 2);
    expect(points.map((p) => p.expectancy)).toEqual([0, 15]);
  });

  it('returns nothing until the window is full, and defaults to 20 trades', () => {
    expect(rollingExpectancy(series([10, 20]), 3)).toEqual([]);
    expect(rollingExpectancy(series(Array(19).fill(5)))).toEqual([]);
    expect(rollingExpectancy(series(Array(20).fill(5)))).toHaveLength(1);
  });
});

describe('timeOfDay', () => {
  // A trade entered at `openedAt`, closed a minute later.
  const enteredAt = (openedAt, gross = 10) => ({
    ...option(gross, 0),
    openedAt: new Date(openedAt),
    closedAt: new Date(new Date(openedAt).getTime() + 60_000),
  });
  const bucket = (buckets, start) => buckets.find((b) => b.start === start);

  it('lays out the regular session in 30-minute buckets, 9:30 to 15:30, even the empty ones', () => {
    const buckets = timeOfDay([]);
    expect(buckets).toHaveLength(13);
    expect(buckets[0].start).toBe('09:30');
    expect(buckets[1].start).toBe('10:00');
    expect(buckets.at(-1).start).toBe('15:30');
    expect(buckets.every((b) => b.trades === 0)).toBe(true);
  });

  it('puts each trade in the bucket of its entry time in New York, not its close', () => {
    const buckets = timeOfDay([
      enteredAt('2026-04-13T13:45:00Z', 30), // 9:45 EDT
      enteredAt('2026-04-13T14:00:00Z', -10), // 10:00 EDT
      enteredAt('2026-04-13T19:59:00Z', 5), // 15:59 EDT, closes after the bell
    ]);
    expect(bucket(buckets, '09:30')).toMatchObject({ trades: 1, netPnl: 30 });
    expect(bucket(buckets, '10:00')).toMatchObject({ trades: 1, netPnl: -10 });
    expect(bucket(buckets, '15:30')).toMatchObject({ trades: 1, netPnl: 5 });
  });

  it('starts the session at 9:30 sharp and puts 15:30 in the last bucket', () => {
    const buckets = timeOfDay([
      enteredAt('2026-04-13T13:29:00Z'), // 9:29 EDT, a minute before the open
      enteredAt('2026-04-13T13:30:00Z'), // 9:30 EDT
      enteredAt('2026-04-13T19:30:00Z'), // 15:30 EDT
    ]);
    expect(bucket(buckets, 'outside').trades).toBe(1);
    expect(bucket(buckets, '09:30').trades).toBe(1);
    expect(bucket(buckets, '15:30').trades).toBe(1);
  });

  it('follows the New York clock through the time change', () => {
    const buckets = timeOfDay([enteredAt('2026-01-13T15:00:00Z')]); // 10:00 EST
    expect(bucket(buckets, '10:00').trades).toBe(1);
  });

  it('adds an Outside session bucket for entries before 9:30 or at 16:00 or later, only when there are some', () => {
    expect(timeOfDay([]).some((b) => b.start === 'outside')).toBe(false);

    const buckets = timeOfDay([
      enteredAt('2026-04-13T12:00:00Z', 20), // 8:00 EDT
      enteredAt('2026-04-13T20:00:00Z', -5), // 16:00 EDT, the first minute after the session
    ]);
    expect(buckets.at(-1)).toMatchObject({ start: 'outside', trades: 2, netPnl: 15 });
  });

  it('summarizes each bucket the way the monthly summary does, and skips trades still open', () => {
    const open = { ...enteredAt('2026-04-13T14:00:00Z'), exitPrice: null, closedAt: null };
    const buckets = timeOfDay([enteredAt('2026-04-13T14:05:00Z', 30), enteredAt('2026-04-13T14:10:00Z', -10), open]);
    expect(bucket(buckets, '10:00')).toMatchObject({ trades: 2, wins: 1, losses: 1, winRate: 0.5, netPnl: 20 });
  });
});

describe('callsVsPuts', () => {
  const side = (optionType, gross) => ({ ...option(gross, 0), assetClass: 'option', optionType });

  it('summarizes calls and puts separately, calls first', () => {
    const rows = callsVsPuts([side('put', -10), side('call', 30), side('call', -10), side('put', 5)]);
    expect(rows.map((r) => r.type)).toEqual(['call', 'put']);
    expect(rows[0]).toMatchObject({ trades: 2, wins: 1, losses: 1, netPnl: 20 });
    expect(rows[1]).toMatchObject({ trades: 2, wins: 1, losses: 1, netPnl: -5 });
  });

  it('keeps a side with no closed trades, with null figures', () => {
    const rows = callsVsPuts([side('call', 10)]);
    expect(rows[1]).toMatchObject({ type: 'put', trades: 0, netPnl: 0, winRate: null });
  });

  it('leaves out trades that are not options, and trades still open', () => {
    const stock = { ...option(50, 0), assetClass: 'stock', optionType: null };
    const open = { ...side('call', 10), exitPrice: null, closedAt: null };
    expect(callsVsPuts([stock, open]).map((r) => r.trades)).toEqual([0, 0]);
  });
});

describe('byUnderlying', () => {
  const on = (symbol, gross) => ({ ...option(gross, 0), symbol });

  it('summarizes each symbol, the best net P/L first', () => {
    const rows = byUnderlying([on('QQQ', -20), on('SPY', 30), on('SPY', 10), on('NVDA', 5)]);
    expect(rows.map((r) => [r.symbol, r.trades, r.netPnl])).toEqual([
      ['SPY', 2, 40],
      ['NVDA', 1, 5],
      ['QQQ', 1, -20],
    ]);
  });

  it('breaks a tie in net P/L by symbol, so the order is stable', () => {
    expect(byUnderlying([on('SPY', 10), on('AAPL', 10)]).map((r) => r.symbol)).toEqual(['AAPL', 'SPY']);
  });

  it('skips trades still open, and has no rows without trades', () => {
    const open = { ...on('SPY', 10), exitPrice: null, closedAt: null };
    expect(byUnderlying([open])).toEqual([]);
    expect(byUnderlying([])).toEqual([]);
  });
});

describe('rDistribution', () => {
  // A long stock trade risking $1 a share on one share, so R is the P/L in dollars.
  const stock = (net, extra = {}) => ({
    direction: 'long',
    quantity: 1,
    multiplier: 1,
    entryPrice: 10,
    initialStop: 9,
    exitPrice: 10 + net,
    fees: 0,
    openedAt: new Date('2026-04-13T14:00:00Z'),
    closedAt: new Date('2026-04-13T20:00:00Z'),
    ...extra,
  });

  it('counts trades in bins one R wide, a trade on an edge going in the bin above it', () => {
    const { bins } = rDistribution([stock(-1), stock(-0.5), stock(0.5), stock(1), stock(1.5), stock(2.5)]);
    expect(bins.map((b) => [b.from, b.to, b.count])).toEqual([
      [-1, 0, 2],
      [0, 1, 1],
      [1, 2, 2],
      [2, 3, 1],
    ]);
  });

  it('keeps empty bins between the extremes, so the axis does not skip', () => {
    const { bins } = rDistribution([stock(-2), stock(2)]);
    expect(bins.map((b) => b.count)).toEqual([1, 0, 0, 0, 1]);
  });

  it('is not thrown by floating-point error at an edge', () => {
    // Risking 1.10 - 1.00 and making 1.40 - 1.10 is 3R, but the division gives 2.9999999999999956.
    const nearly = stock(0, { entryPrice: 1.1, initialStop: 1, exitPrice: 1.4 });
    const { bins } = rDistribution([nearly]);
    expect(bins).toEqual([{ from: 3, to: 4, count: 1 }]);
  });

  it('counts only trades with an R, and reports how many closed trades there were', () => {
    const noStop = stock(1, { initialStop: null });
    const open = stock(1, { exitPrice: null, closedAt: null });
    const result = rDistribution([stock(1), noStop, open]);
    expect([result.measured, result.total]).toEqual([1, 2]);
  });

  it('has no bins when no trade has an R', () => {
    expect(rDistribution([])).toEqual({ bins: [], measured: 0, total: 0 });
  });
});

describe('modeComparison', () => {
  const inMode = (mode, gross, fees = 1) => ({ ...option(gross, fees), mode });

  it('summarizes each mode on its own, never blended into one number', () => {
    const result = modeComparison([
      inMode('live', 30),
      inMode('live', -10),
      inMode('paper', 50),
      inMode('backtest', -20),
      inMode('backtest', -20),
    ]);

    expect(result.live).toMatchObject({ trades: 2, winRate: 0.5, netExpectancy: 9, avgWin: 30, avgLoss: -10 });
    expect(result.paper).toMatchObject({ trades: 1, winRate: 1, netExpectancy: 49 });
    expect(result.backtest).toMatchObject({ trades: 2, winRate: 0, netExpectancy: -21 });
    expect(result.live.profitFactor).toBe(3);
  });

  it('always has all three modes, with no figures for one that has no trades', () => {
    const result = modeComparison([inMode('live', 10)]);

    expect(Object.keys(result)).toEqual(['live', 'paper', 'backtest']);
    expect(result.paper).toMatchObject({ trades: 0, winRate: null, expectancy: null, profitFactor: null });
  });

  it('counts only closed trades, and ignores a trade in a mode it does not know', () => {
    const open = { ...inMode('live', 10), exitPrice: null, closedAt: null };
    const result = modeComparison([open, inMode('live', 10), inMode('demo', 99)]);

    expect(result.live.trades).toBe(1);
    expect(Object.values(result).reduce((total, s) => total + s.trades, 0)).toBe(1);
  });
});

describe('graduation', () => {
  // The i-th trade of a run, closing an hour after the one before it.
  const hour = (i) => new Date(Date.UTC(2026, 3, 1, 14 + i)).toISOString();
  const trade = (mode, strategyId, gross, i, fees = 0) => ({ ...option(gross, fees, hour(i)), mode, strategyId });
  const run = (mode, strategyId, grosses, fees = 0) => grosses.map((g, i) => trade(mode, strategyId, g, i, fees));
  const row = (rows, id) => rows.find((r) => r.strategyId === id);

  it('defaults to a window of 30 trades', () => {
    expect(GRAD_N).toBe(30);
  });

  it('has a row per setup with a cell per mode, the trades without a setup in the last row', () => {
    const rows = graduation([
      ...run('paper', null, [5, 5, 5]),
      ...run('live', 'a', [10]),
      ...run('paper', 'a', [10, 10]),
      ...run('backtest', 'b', [10, 10, 10, 10]),
    ]);

    expect(rows.map((r) => r.strategyId)).toEqual(['b', 'a', null]);
    expect(row(rows, 'a').modes.live).toMatchObject({ trades: 1, window: 1 });
    expect(row(rows, 'a').modes.paper).toMatchObject({ trades: 2, window: 2 });
    expect(row(rows, 'a').modes.backtest).toMatchObject({ trades: 0, window: 0, netExpectancy: null, met: false });
  });

  it('is met on the most recent 30 trades, so old losses drop out', () => {
    // Five losses, then thirty wins: 35 trades, but the last 30 are all wins.
    const rows = graduation(run('paper', 'a', [...Array(5).fill(-10), ...Array(30).fill(10)]));

    expect(row(rows, 'a').modes.paper).toMatchObject({ trades: 35, window: 30, netExpectancy: 10, met: true });
  });

  it('is not met before 30 trades, however good they are', () => {
    const rows = graduation(run('backtest', 'a', Array(12).fill(10)));

    expect(row(rows, 'a').modes.backtest).toMatchObject({ trades: 12, window: 12, netExpectancy: 10, met: false });
  });

  it('is not met at 30 trades unless expectancy is above zero', () => {
    const rows = graduation([...run('live', 'a', Array(30).fill(0)), ...run('live', 'b', Array(30).fill(-1))]);

    expect(row(rows, 'a').modes.live).toMatchObject({ window: 30, netExpectancy: 0, met: false });
    expect(row(rows, 'b').modes.live.met).toBe(false);
  });

  it('judges expectancy after fees: a trade that wins gross but nets zero does not count', () => {
    // 1.00 gross each, 1.00 in fees: gross expectancy is +1, net is 0.
    const rows = graduation(run('paper', 'a', Array(30).fill(1), 1));

    expect(row(rows, 'a').modes.paper).toMatchObject({ netExpectancy: 0, met: false });
  });

  it('sorts by closing time, whatever order the trades arrive in', () => {
    const trades = run('paper', 'a', [...Array(5).fill(-10), ...Array(30).fill(10)]).reverse();

    expect(row(graduation(trades), 'a').modes.paper.met).toBe(true);
  });

  it('gives the live-minus-paper gap in net expectancy once both windows are full', () => {
    const rows = graduation([...run('live', 'a', Array(30).fill(10)), ...run('paper', 'a', Array(30).fill(40))]);

    expect(row(rows, 'a').gap).toBe(-30);
  });

  it('gives no gap while either window is still filling, since a few trades say little', () => {
    const rows = graduation([
      ...run('live', 'a', Array(30).fill(10)),
      ...run('paper', 'a', Array(29).fill(40)),
      ...run('live', 'b', Array(29).fill(10)),
      ...run('paper', 'b', Array(30).fill(40)),
      ...run('live', 'c', [10, 20]),
      ...run('paper', 'c', [40]),
      ...run('live', 'd', Array(30).fill(10)),
    ]);

    expect(['a', 'b', 'c', 'd'].map((id) => row(rows, id).gap)).toEqual([null, null, null, null]);
  });

  it('counts only closed trades', () => {
    const open = { ...trade('live', 'a', 10, 0), exitPrice: null, closedAt: null };

    expect(graduation([open])).toEqual([]);
  });
});
