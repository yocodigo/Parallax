import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { GET } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

// A closed long in AAPL for `r` (1R = $100), entered before the open so the
// time-of-day rule never matches whenever the test runs.
async function closedTrades(count, r, { mode = 'paper', symbol = 'AAPL' } = {}) {
  for (let i = 0; i < count; i += 1) {
    await getDb()
      .insert(trades)
      .values({
        mode,
        symbol,
        assetClass: 'stock',
        direction: 'long',
        quantity: 100,
        plannedEntry: 50,
        entryPrice: 50,
        initialStop: 49,
        exitPrice: 50 + r,
        // 8 AM in New York, closed that afternoon.
        openedAt: new Date(Date.UTC(2026, 9, 1 + i, 12)),
        closedAt: new Date(Date.UTC(2026, 9, 1 + i, 20)),
      });
  }
}

const get = (query) => GET(new Request(`http://localhost/api/insights/warnings?${new URLSearchParams(query)}`));
const plan = { mode: 'paper', direction: 'long', assetClass: 'stock', symbol: 'aapl' };

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('GET /api/insights/warnings', () => {
  it("warns about a plan from the trader's closed trades", async () => {
    await closedTrades(5, -1);

    const response = await get(plan);

    expect(response.status).toBe(200);
    expect((await response.json()).warnings).toEqual([
      { rule: 'symbol', symbol: 'AAPL', trades: 5, averageR: -1 },
      { rule: 'side', direction: 'long', assetClass: 'stock', trades: 5, averageR: -1 },
    ]);
  });

  it('only looks at trades in the same mode', async () => {
    await closedTrades(5, -1, { mode: 'backtest' });

    expect((await (await get(plan)).json()).warnings).toEqual([]);
  });

  it('works before a symbol is entered', async () => {
    await closedTrades(5, -1);

    const { warnings } = await (await get({ ...plan, symbol: '' })).json();

    expect(warnings.map((warning) => warning.rule)).toEqual(['side']);
  });

  it('rejects an invalid plan', async () => {
    const response = await get({ ...plan, direction: 'sideways' });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('direction');
  });
});
