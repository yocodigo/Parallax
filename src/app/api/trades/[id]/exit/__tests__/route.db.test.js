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

const filled = { entryPrice: 100, openedAt: new Date('2026-10-20T14:00:00Z') };

const exit = {
  exitPrice: 104,
  closedAt: '2026-10-21T15:00:00.000Z',
  exitReason: 'target',
  exitedPerPlan: true,
  fees: 1,
};

async function insertTrade(values = {}) {
  const [trade] = await getDb().insert(trades).values({ ...plan, ...values }).returning();
  return trade;
}

// Route handlers get their dynamic segments as a promise.
const post = (id, body) =>
  POST(
    new Request(`http://localhost/api/trades/${id}/exit`, { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('POST /api/trades/[id]/exit', () => {
  it('closes an open trade', async () => {
    const trade = await insertTrade(filled);

    const response = await post(trade.id, exit);

    expect(response.status).toBe(200);
    expect((await response.json()).trade).toMatchObject({
      id: trade.id,
      exitPrice: 104,
      closedAt: exit.closedAt,
      exitReason: 'target',
      exitedPerPlan: true,
      fees: 1,
    });
  });

  it('rejects an exit before the entry', async () => {
    const trade = await insertTrade(filled);

    const response = await post(trade.id, { ...exit, closedAt: '2026-10-20T13:00:00.000Z' });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('closedAt');
  });

  it('refuses a trade with no entry yet', async () => {
    const trade = await insertTrade();

    const response = await post(trade.id, exit);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/record the entry first/i);
  });

  it('refuses a trade that is already closed', async () => {
    const trade = await insertTrade({
      ...filled,
      exitPrice: 104,
      closedAt: new Date(exit.closedAt),
      exitReason: 'target',
      exitedPerPlan: true,
    });

    const response = await post(trade.id, exit);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already closed/i);
  });

  it('answers 404 for a trade that does not exist', async () => {
    expect((await post('00000000-0000-4000-8000-000000000000', exit)).status).toBe(404);
  });
});
