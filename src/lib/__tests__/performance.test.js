import { describe, expect, it } from 'vitest';
import { equityCurve, monthlySummary, rollingExpectancy, summarize } from '../performance';

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
