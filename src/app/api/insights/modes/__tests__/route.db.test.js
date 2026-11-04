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

// A closed long option, 1 contract, entered an hour before it closed. A stock
// trade passes `stock: true`, which drops the contract fields.
async function closedTrade(net, closedAt, { mode = 'live', strategyId = null, stock = false } = {}) {
  const closed = new Date(closedAt);
  await getDb()
    .insert(trades)
    .values({
      mode,
      strategyId,
      symbol: 'SPY',
      assetClass: stock ? 'stock' : 'option',
      direction: 'long',
      quantity: 1,
      multiplier: stock ? 1 : 100,
      optionType: stock ? null : 'call',
      strike: stock ? null : 500,
      expiration: stock ? null : closedAt.slice(0, 10),
      plannedEntry: 1,
      plannedStop: stock ? 0.5 : null,
      entryPrice: 1,
      exitPrice: 1 + net / (stock ? 1 : 100),
      fees: 0,
      openedAt: new Date(closed.getTime() - 60 * 60 * 1000),
      closedAt: closed,
    });
}

const strategy = (name) =>
  createStrategy(getDb(), { name, description: '', rules: [{ text: 'Trend aligned', kind: 'edge' }] });

const get = (query = '') => GET(new Request(`http://localhost/api/insights/modes${query}`));

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('GET /api/insights/modes', () => {
  it('compares the three modes over every year, not one', async () => {
    await closedTrade(30, '2025-03-10T20:00:00Z');
    await closedTrade(-10, '2026-04-13T20:00:00Z');
    await closedTrade(50, '2026-04-14T20:00:00Z', { mode: 'paper' });

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body.modes)).toEqual(['live', 'paper', 'backtest']);
    expect(body.modes.live).toMatchObject({ trades: 2, netPnl: 20 });
    expect(body.modes.paper).toMatchObject({ trades: 1, netPnl: 50 });
    expect(body.modes.backtest.trades).toBe(0);
  });

  it('lists each setup by name with its gate cells, no gap while the windows fill, trades without one last', async () => {
    const trend = await strategy('Trend pullback');
    await closedTrade(20, '2026-04-13T20:00:00Z', { strategyId: trend.id });
    await closedTrade(60, '2026-04-14T20:00:00Z', { strategyId: trend.id, mode: 'paper' });
    await closedTrade(5, '2026-04-15T20:00:00Z');

    const { setups } = await (await get()).json();

    expect(setups.map((s) => [s.strategyId, s.name])).toEqual([
      [trend.id, 'Trend pullback'],
      [null, null],
    ]);
    expect(setups[0].modes.live).toMatchObject({ trades: 1, window: 1, netExpectancy: 20, met: false });
    // One live and one paper trade: far short of a full window, so no gap yet.
    expect(setups[0].gap).toBeNull();
    expect(setups[1].gap).toBeNull();
  });

  it('says how many trades fill a graduation window, so the page need not repeat the number', async () => {
    const body = await (await get()).json();

    expect(body.gradN).toBe(30);
  });

  it('limits both to one asset class when asked', async () => {
    await closedTrade(30, '2026-04-13T20:00:00Z');
    await closedTrade(8, '2026-04-14T20:00:00Z', { stock: true });

    const { modes } = await (await get('?asset=stock')).json();

    expect(modes.live).toMatchObject({ trades: 1, netPnl: 8 });
  });

  it('answers 400 for an asset class it does not know', async () => {
    const response = await get('?asset=futures');

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors.asset).toBeDefined();
  });
});
