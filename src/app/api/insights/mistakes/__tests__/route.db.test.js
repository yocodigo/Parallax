import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { journalEntries, trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { GET } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

// A closed long with 1R = $100, closed for `r`.
async function closedTrade(r, { mode = 'paper', mistakes = [] } = {}) {
  const [trade] = await getDb()
    .insert(trades)
    .values({
      mode,
      symbol: 'SPY',
      assetClass: 'stock',
      direction: 'long',
      quantity: 100,
      plannedEntry: 50,
      entryPrice: 50,
      initialStop: 49,
      exitPrice: 50 + r,
      openedAt: new Date('2026-10-19T14:00:00Z'),
      closedAt: new Date('2026-10-20T15:00:00Z'),
    })
    .returning();
  await getDb().insert(journalEntries).values({ tradeId: trade.id, kind: 'review', notes: 'Review', mistakes });
  return trade;
}

const get = (query = '') => GET(new Request(`http://localhost/api/insights/mistakes${query}`));

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('GET /api/insights/mistakes', () => {
  it('returns what each mistake has cost, against trades without mistakes', async () => {
    await closedTrade(-2, { mistakes: ['moved_stop'] });
    await closedTrade(1);

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mistakes: [{ mistake: 'moved_stop', trades: 1, totalR: -2, averageR: -2 }],
      baseline: { trades: 1, averageR: 1 },
      trades: 2,
    });
  });

  it('can be limited to one mode', async () => {
    await closedTrade(-2, { mode: 'backtest', mistakes: ['moved_stop'] });
    await closedTrade(-1, { mode: 'live', mistakes: ['oversized'] });

    const { mistakes } = await (await get('?mode=live')).json();

    expect(mistakes.map((row) => row.mistake)).toEqual(['oversized']);
  });

  it('rejects an unknown mode', async () => {
    const response = await get('?mode=imaginary');

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('mode');
  });
});
