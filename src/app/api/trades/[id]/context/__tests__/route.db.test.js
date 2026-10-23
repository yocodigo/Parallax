import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { saveTradeContext } from '@/db/contexts';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { GET } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

async function insertTrade() {
  const [trade] = await getDb()
    .insert(trades)
    .values({ mode: 'paper', symbol: 'SPY', assetClass: 'stock', direction: 'long', quantity: 1 })
    .returning();
  return trade;
}

const get = (id) =>
  GET(new Request(`http://localhost/api/trades/${id}/context`), { params: Promise.resolve({ id }) });

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('GET /api/trades/[id]/context', () => {
  it('returns the snapshot captured at entry', async () => {
    const trade = await insertTrade();
    await saveTradeContext(getDb(), trade.id, { version: 1, market: { spyTrend: 'up' } });

    const response = await get(trade.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ context: { version: 1, market: { spyTrend: 'up' } } });
  });

  it('returns null when none was captured', async () => {
    const trade = await insertTrade();

    expect(await (await get(trade.id)).json()).toEqual({ context: null });
  });

  it('answers 404 for an id that is not a trade id', async () => {
    expect((await get('nope')).status).toBe(404);
  });
});
