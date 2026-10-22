import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { DEFAULT_BREAKER_SETTINGS } from '@/lib/circuitBreakerSettings';
import { GET, PUT } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const settings = {
  maxDailyLossR: 2,
  maxTradesPerDay: null,
  cooldownAfterLosses: null,
  cooldownMinutes: null,
  modes: ['paper'],
};

// A paper long closed just now for `r` (1R = $100).
async function closedToday(r) {
  const closedAt = new Date();
  await getDb()
    .insert(trades)
    .values({
      mode: 'paper',
      symbol: 'SPY',
      assetClass: 'stock',
      direction: 'long',
      quantity: 100,
      plannedEntry: 50,
      entryPrice: 50,
      initialStop: 49,
      exitPrice: 50 + r,
      openedAt: new Date(closedAt.getTime() - 60_000),
      closedAt,
    });
}

const get = () => GET(new Request('http://localhost/api/circuit-breakers'));
const put = (body) =>
  PUT(new Request('http://localhost/api/circuit-breakers', { method: 'PUT', body: JSON.stringify(body) }));

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('/api/circuit-breakers', () => {
  it('starts with every limit off and nothing tripped', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      settings: DEFAULT_BREAKER_SETTINGS,
      status: { tripped: [], today: { r: 0, trades: 0 }, losingStreak: 0 },
    });
  });

  it('saves new limits and reports where today stands against them', async () => {
    await closedToday(-2.5);

    const response = await put(settings);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.settings).toEqual(settings);
    expect(body.status.tripped).toEqual([{ breaker: 'dailyLoss', limitR: 2, todayR: -2.5 }]);
    expect((await (await get()).json()).settings).toEqual(settings);
  });

  it('rejects invalid limits', async () => {
    const response = await put({ ...settings, maxDailyLossR: -1 });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('maxDailyLossR');
  });
});
