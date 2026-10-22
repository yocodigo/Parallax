import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { POST } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const plan = {
  mode: 'paper',
  symbol: 'SPY',
  assetClass: 'stock',
  direction: 'long',
  quantity: 10,
  plannedEntry: 100,
  initialStop: 98,
};

const entry = { entryPrice: 100.2, openedAt: '2026-10-20T14:00:00.000Z' };

async function insertTrade(values = {}) {
  const [trade] = await getDb().insert(trades).values({ ...plan, ...values }).returning();
  return trade;
}

// Route handlers get their dynamic segments as a promise.
const post = (id, body) =>
  POST(
    new Request(`http://localhost/api/trades/${id}/entry`, { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('POST /api/trades/[id]/entry', () => {
  it("records a planned trade's entry fill", async () => {
    const trade = await insertTrade();

    const response = await post(trade.id, entry);

    expect(response.status).toBe(200);
    expect((await response.json()).trade).toMatchObject({
      id: trade.id,
      entryPrice: 100.2,
      openedAt: entry.openedAt,
    });
  });

  it('rejects an invalid fill', async () => {
    const trade = await insertTrade();

    const response = await post(trade.id, { entryPrice: -1, openedAt: entry.openedAt });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('entryPrice');
  });

  it('refuses a trade that already has an entry', async () => {
    const trade = await insertTrade({ entryPrice: 100, openedAt: new Date(entry.openedAt) });

    const response = await post(trade.id, entry);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already has an entry/i);
  });

  it('answers 404 for a trade that does not exist, or an id that is not one', async () => {
    expect((await post('00000000-0000-4000-8000-000000000000', entry)).status).toBe(404);
    expect((await post('not-a-uuid', entry)).status).toBe(404);
  });
});
