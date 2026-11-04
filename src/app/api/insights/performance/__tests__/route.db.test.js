import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { createStrategy } from '@/db/strategies';
import { GET } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

// A closed long option, 1 contract, entered an hour before it closed.
async function closedOption(net, closedAt, { mode = 'live', fees = 0, strategyId = null, optionType = 'call' } = {}) {
  const closed = new Date(closedAt);
  const day = closedAt.slice(0, 10);
  await getDb()
    .insert(trades)
    .values({
      mode,
      strategyId,
      symbol: 'SPY',
      assetClass: 'option',
      direction: 'long',
      quantity: 1,
      multiplier: 100,
      optionType,
      strike: 500,
      expiration: day,
      plannedEntry: 1,
      entryPrice: 1,
      exitPrice: 1 + net / 100,
      fees,
      openedAt: new Date(closed.getTime() - 60 * 60 * 1000),
      closedAt: closed,
    });
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
