import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { journalEntries, trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { saveTradeContext } from '@/db/contexts';
import { createStrategy } from '@/db/strategies';
import { GET } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

// A closed long option, 1 contract, entered an hour before it closed.
async function closedOption(net, closedAt, { mode = 'live', fees = 0, strategyId = null, optionType = 'call', planned = false, symbol = 'SPY', initialStop = null } = {}) {
  const closed = new Date(closedAt);
  const day = closedAt.slice(0, 10);
  const [trade] = await getDb()
    .insert(trades)
    .values({
      mode,
      strategyId,
      symbol,
      assetClass: 'option',
      direction: 'long',
      quantity: 1,
      multiplier: 100,
      optionType,
      strike: 500,
      expiration: day,
      plannedEntry: 1,
      initialStop,
      entryPrice: 1,
      exitPrice: 1 + net / 100,
      fees,
      openedAt: new Date(closed.getTime() - 60 * 60 * 1000),
      closedAt: closed,
    })
    .returning();
  // A plan written two hours before the fill.
  if (planned) {
    await getDb()
      .insert(journalEntries)
      .values({ kind: 'plan', notes: 'Plan.', tradeId: trade.id, createdAt: new Date(closed.getTime() - 3 * 60 * 60 * 1000) });
  }
  return trade;
}

const get = (query = '') => GET(new Request(`http://localhost/api/insights/performance${query}`));

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('GET /api/insights/performance', () => {
  it('returns the months, the year to date, and adherence for live trades in the year', async () => {
    await closedOption(30, '2026-03-10T20:00:00Z');
    await closedOption(-10, '2026-04-13T20:00:00Z');
    await closedOption(500, '2026-04-14T20:00:00Z', { mode: 'paper' });
    await closedOption(900, '2025-12-31T20:00:00Z');
    // 05:00Z on January 1, 2027 is New York midnight: the next year's first moment.
    await closedOption(700, '2027-01-01T05:00:00Z');

    const response = await get('?year=2026');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.months.map((m) => [m.month, m.netPnl])).toEqual([
      ['2026-03', 30],
      ['2026-04', -10],
    ]);
    expect(body.yearToDate).toMatchObject({ trades: 2, netPnl: 20 });
    expect(body.adherence).toMatchObject({ trades: 2, size: { ok: 2, missed: 0, cost: 0 } });
  });

  it('counts Plan OK from a plan written before the fill and a strategy picked', async () => {
    const strategy = await createStrategy(getDb(), { name: 'Band cross', description: '', rules: [{ text: 'Trend aligned', kind: 'edge' }] });
    await closedOption(30, '2026-03-10T20:00:00Z', { planned: true, strategyId: strategy.id });
    await closedOption(-10, '2026-04-13T20:00:00Z', { planned: true });
    await closedOption(-20, '2026-04-14T20:00:00Z');

    const body = await (await get('?year=2026')).json();

    expect(body.adherence.plan).toEqual({ ok: 1, missed: 2, cost: -30 });
  });

  it('returns the equity curve of the year, net of fees, in closing order', async () => {
    await closedOption(-10, '2026-04-13T20:00:00Z', { fees: 1.3 });
    await closedOption(30, '2026-03-10T20:00:00Z');

    const body = await (await get('?year=2026')).json();

    expect(body.equity).toEqual([
      { closedAt: '2026-03-10T20:00:00.000Z', cumulative: 30, drawdown: 0 },
      { closedAt: '2026-04-13T20:00:00.000Z', cumulative: 18.7, drawdown: 11.3 },
    ]);
  });

  it('returns expectancy over the last 20 closed trades of the year, once 20 have closed', async () => {
    // One loss, then twenty wins: the first window holds the loss, the second has dropped it.
    await closedOption(-10, '2026-03-02T20:00:00Z', { fees: 1 });
    for (let day = 3; day <= 22; day++) {
      await closedOption(10, `2026-03-${String(day).padStart(2, '0')}T20:00:00Z`, { fees: 1 });
    }

    const body = await (await get('?year=2026')).json();

    expect(body.rolling).toEqual([
      { closedAt: '2026-03-21T20:00:00.000Z', expectancy: 9, netExpectancy: 8 },
      { closedAt: '2026-03-22T20:00:00.000Z', expectancy: 10, netExpectancy: 9 },
    ]);
  });

  it('returns results by half hour of entry, New York time', async () => {
    // Entered an hour before closing: 15:00Z closes at 11:00 EDT, so it opened in the 10:00 bucket.
    await closedOption(30, '2026-04-13T15:00:00Z');
    await closedOption(-10, '2026-04-14T15:20:00Z');
    await closedOption(5, '2026-04-15T20:00:00Z'); // opened 15:00 EDT, the 15:00 bucket
    // Closed in 2027, so out of the 2026 view even though its entry time would fit a bucket.
    await closedOption(99, '2027-01-04T15:00:00Z');

    const body = await (await get('?year=2026')).json();

    expect(body.timeOfDay).toHaveLength(13);
    expect(body.timeOfDay.find((b) => b.start === '10:00')).toMatchObject({ trades: 2, netPnl: 20 });
    expect(body.timeOfDay.find((b) => b.start === '15:00')).toMatchObject({ trades: 1, netPnl: 5 });
  });

  it('returns calls and puts summarized separately', async () => {
    await closedOption(30, '2026-04-13T20:00:00Z', { optionType: 'call' });
    await closedOption(-10, '2026-04-14T20:00:00Z', { optionType: 'put' });
    await closedOption(-5, '2026-04-15T20:00:00Z', { optionType: 'put' });

    const body = await (await get('?year=2026')).json();

    expect(body.callsVsPuts.map((r) => [r.type, r.trades, r.netPnl])).toEqual([
      ['call', 1, 30],
      ['put', 2, -15],
    ]);
  });

  it('returns results by underlying, the best first', async () => {
    await closedOption(-10, '2026-04-13T20:00:00Z', { symbol: 'QQQ' });
    await closedOption(30, '2026-04-14T20:00:00Z');
    await closedOption(5, '2026-04-15T20:00:00Z');

    const body = await (await get('?year=2026')).json();

    expect(body.byUnderlying.map((r) => [r.symbol, r.trades, r.netPnl])).toEqual([
      ['SPY', 2, 35],
      ['QQQ', 1, -10],
    ]);
  });

  it('returns the R-multiple distribution of the trades that have a stop', async () => {
    // 1 contract at $1.00 premium with a $0.50 stop risks $50: +$100 is 2R, -$25 is -0.5R.
    await closedOption(100, '2026-04-13T20:00:00Z', { initialStop: 0.5 });
    await closedOption(-25, '2026-04-14T20:00:00Z', { initialStop: 0.5 });
    await closedOption(40, '2026-04-15T20:00:00Z');

    const body = await (await get('?year=2026')).json();

    expect(body.rDistribution).toEqual({
      bins: [
        { from: -1, to: 0, count: 1 },
        { from: 0, to: 1, count: 0 },
        { from: 1, to: 2, count: 0 },
        { from: 2, to: 3, count: 1 },
      ],
      measured: 2,
      total: 3,
    });
  });

  it('returns results by setup with the strategy names, the trades with none last', async () => {
    const strategy = await createStrategy(getDb(), { name: 'Band cross', description: '', rules: [{ text: 'Trend aligned', kind: 'edge' }] });
    await closedOption(30, '2026-04-13T20:00:00Z', { strategyId: strategy.id });
    await closedOption(-20, '2026-04-14T20:00:00Z', { strategyId: strategy.id });
    await closedOption(50, '2026-04-15T20:00:00Z');

    const body = await (await get('?year=2026')).json();

    expect(body.bySetup.map((r) => [r.name, r.trades, r.netPnl])).toEqual([
      ['Band cross', 2, 10],
      [null, 1, 50],
    ]);
  });

  it('returns results by four-touch grade, counting the trades whose grade is unknown', async () => {
    const withGrade = async (net, closedAt, setups) => {
      const trade = await closedOption(net, closedAt);
      if (setups !== undefined) await saveTradeContext(getDb(), trade.id, { version: 2, setups });
    };
    await withGrade(30, '2026-04-13T20:00:00Z', { fourTouch: { grade: { grade: 'A' } } });
    await withGrade(-20, '2026-04-14T20:00:00Z', { fourTouch: null });
    await withGrade(50, '2026-04-15T20:00:00Z');

    const body = await (await get('?year=2026')).json();

    expect(body.byGrade.rows.map((r) => [r.grade, r.trades, r.netPnl])).toEqual([
      ['A', 1, 30],
      ['none', 1, -20],
    ]);
    expect(body.byGrade.unknown).toBe(1);
  });

  it('returns the discipline score of each month, from the option trades closed in it', async () => {
    const strategy = await createStrategy(getDb(), { name: 'Band cross', description: '', rules: [{ text: 'Trend aligned', kind: 'edge' }] });
    // A planned trade with a strategy: Plan OK met. No stop and no exit reason, so nothing else applies.
    await closedOption(30, '2026-03-10T20:00:00Z', { planned: true, strategyId: strategy.id });
    // No plan entry and no strategy: Plan OK missed.
    await closedOption(-10, '2026-04-13T20:00:00Z');

    const body = await (await get('?year=2026')).json();

    expect(body.disciplineByMonth).toEqual([
      { month: '2026-03', ok: 1, missed: 0, score: 1 },
      { month: '2026-04', ok: 0, missed: 1, score: 0 },
    ]);
  });

  it('returns the average emotional control of the reviews on trades closed in each month', async () => {
    const march = await closedOption(30, '2026-03-10T20:00:00Z');
    const april = await closedOption(-10, '2026-04-13T20:00:00Z');
    await closedOption(5, '2026-05-12T20:00:00Z');
    await getDb().insert(journalEntries).values([
      { kind: 'review', notes: 'n', tradeId: march.id, emotionalControl: 8 },
      { kind: 'review', notes: 'n', tradeId: april.id, emotionalControl: 3 },
      { kind: 'review', notes: 'n', tradeId: april.id, emotionalControl: 5 },
    ]);

    const body = await (await get('?year=2026')).json();

    expect(body.emotionalControlByMonth).toEqual([
      { month: '2026-03', average: 8, reviews: 1 },
      { month: '2026-04', average: 4, reviews: 2 },
    ]);
  });

  it('with year=all returns the mode\'s trades from every year, the months in order across them', async () => {
    await closedOption(-10, '2026-04-13T20:00:00Z');
    await closedOption(30, '2025-12-10T20:00:00Z');
    await closedOption(5, '2024-01-02T20:00:00Z');
    await closedOption(500, '2025-12-11T20:00:00Z', { mode: 'paper' });

    const body = await (await get('?year=all')).json();

    expect(body.months.map((m) => [m.month, m.netPnl])).toEqual([
      ['2024-01', 5],
      ['2025-12', 30],
      ['2026-04', -10],
    ]);
    expect(body.yearToDate).toMatchObject({ trades: 3, netPnl: 25 });
    expect(body.equity.map((point) => point.cumulative)).toEqual([5, 35, 25]);
  });

  it('with year=all still applies the mode and the other filters', async () => {
    await closedOption(30, '2025-12-10T20:00:00Z', { optionType: 'put' });
    await closedOption(7, '2026-04-13T20:00:00Z', { optionType: 'call' });
    await closedOption(500, '2025-12-11T20:00:00Z', { mode: 'paper' });

    const puts = await (await get('?year=all&optionType=put')).json();
    const paper = await (await get('?year=all&mode=paper')).json();

    expect(puts.yearToDate).toMatchObject({ trades: 1, netPnl: 30 });
    expect(paper.yearToDate).toMatchObject({ trades: 1, netPnl: 500 });
  });

  describe('filters by setup and by call or put', () => {
    const strategy = (name) =>
      createStrategy(getDb(), { name, description: '', rules: [{ text: 'Trend aligned', kind: 'edge' }] });

    it('limits to one setup, or with none to the trades taken without one', async () => {
      const trend = await strategy('Trend pullback');
      await closedOption(30, '2026-04-13T20:00:00Z', { strategyId: trend.id });
      await closedOption(-10, '2026-04-14T20:00:00Z', { strategyId: trend.id });
      await closedOption(5, '2026-04-15T20:00:00Z');

      const one = await (await get(`?year=2026&strategyId=${trend.id}`)).json();
      const none = await (await get('?year=2026&strategyId=none')).json();

      expect(one.yearToDate).toMatchObject({ trades: 2, netPnl: 20 });
      expect(none.yearToDate).toMatchObject({ trades: 1, netPnl: 5 });
    });

    it('limits to calls or to puts', async () => {
      await closedOption(30, '2026-04-13T20:00:00Z');
      await closedOption(-10, '2026-04-14T20:00:00Z', { optionType: 'put' });

      const calls = await (await get('?year=2026&optionType=call')).json();
      const puts = await (await get('?year=2026&optionType=put')).json();

      expect(calls.yearToDate).toMatchObject({ trades: 1, netPnl: 30 });
      expect(puts.yearToDate).toMatchObject({ trades: 1, netPnl: -10 });
    });

    it('applies to every part of the response, and together with the rest', async () => {
      const trend = await strategy('Trend pullback');
      await closedOption(30, '2026-04-13T20:00:00Z', { strategyId: trend.id });
      await closedOption(-10, '2026-04-14T20:00:00Z', { strategyId: trend.id, optionType: 'put' });
      await closedOption(99, '2026-04-15T20:00:00Z', { strategyId: trend.id, mode: 'paper' });

      const body = await (await get(`?year=2026&strategyId=${trend.id}&optionType=call`)).json();

      expect(body.months.map((m) => m.netPnl)).toEqual([30]);
      expect(body.equity.map((p) => p.cumulative)).toEqual([30]);
      expect(body.timeOfDay.reduce((total, b) => total + b.trades, 0)).toBe(1);
    });

    it('answers 400 for an id that is not a uuid or "none", and for a side that is not call or put', async () => {
      const badId = await get('?strategyId=banana');
      const badSide = await get('?optionType=straddle');

      expect(badId.status).toBe(400);
      expect((await badId.json()).fieldErrors.strategyId).toBeDefined();
      expect(badSide.status).toBe(400);
      expect((await badSide.json()).fieldErrors.optionType).toBeDefined();
    });
  });

  it('returns net P/L by the rules the entry broke', async () => {
    // Entered an hour before closing, in New York time (EDT): 15:30 is free, 12:00 is in the 11:00-14:00 lockout.
    await closedOption(40, '2026-04-13T20:30:00Z');
    await closedOption(-25, '2026-04-14T17:00:00Z');
    await closedOption(-5, '2026-04-15T17:00:00Z', { mode: 'paper' });

    const body = await (await get('?year=2026')).json();

    expect(body.violationCosts).toEqual({
      followed: { trades: 1, net: 40 },
      window: { trades: 1, net: -25 },
      size: { trades: 0, net: 0 },
      both: { trades: 0, net: 0 },
    });
  });

  it('counts a trade by the New York year it closed in', async () => {
    // 03:00Z on January 1 is still December 31 in New York.
    await closedOption(40, '2026-01-01T03:00:00Z');

    const body = await (await get('?year=2026')).json();

    expect(body.yearToDate.trades).toBe(0);
  });

  it('limits the tables to one asset class', async () => {
    await closedOption(30, '2026-03-10T20:00:00Z');

    const body = await (await get('?year=2026&asset=stock')).json();

    expect(body.months).toEqual([]);
  });

  it('answers 400 for a mode or year it does not know', async () => {
    expect((await get('?mode=demo')).status).toBe(400);
    expect((await get('?year=abc')).status).toBe(400);
  });
});
