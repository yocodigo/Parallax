import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { tradeRuleChecks, trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { GET } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

// A closed long with 1R = $100, closed for `r`, entered with the volume rule
// met or not.
async function closedTrade(r, { mode = 'paper', met = true } = {}) {
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
  await getDb().insert(tradeRuleChecks).values({ tradeId: trade.id, ruleText: 'Volume rising', met });
  return trade;
}

const get = (query = '') => GET(new Request(`http://localhost/api/insights/checklist${query}`));

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('GET /api/insights/checklist', () => {
  it('compares trades that followed the checklist against those entered anyway', async () => {
    await closedTrade(2);
    await closedTrade(-1, { met: false });

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      followed: { trades: 1, totalR: 2, averageR: 2 },
      broken: { trades: 1, totalR: -1, averageR: -1 },
      rules: [
        { ruleId: null, ruleText: 'Volume rising', checked: 2, skipped: 1, skippedAverageR: -1, metAverageR: 2 },
      ],
      trades: 2,
    });
  });

  it('can be limited to one mode', async () => {
    await closedTrade(2, { mode: 'backtest' });
    await closedTrade(-1, { mode: 'live', met: false });

    const { trades: counted, broken } = await (await get('?mode=live')).json();

    expect(counted).toBe(1);
    expect(broken.trades).toBe(1);
  });

  it('rejects an unknown mode', async () => {
    const response = await get('?mode=imaginary');

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('mode');
  });
});
