import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { resetDb } from '@/db/testing';
import { GET, PUT } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const plan = {
  tradeDate: '2026-10-28',
  symbol: 'SPY',
  ltfDirection: 'bullish',
  ltfFib50: 670.5,
  ltfFib100: 672,
};

const get = (tradeDate, symbol = 'SPY') =>
  GET(new Request(`http://localhost/api/daily-plan?tradeDate=${tradeDate}&symbol=${symbol}`));
const put = (body) =>
  PUT(new Request('http://localhost/api/daily-plan', { method: 'PUT', body: JSON.stringify(body) }));

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('/api/daily-plan', () => {
  it('returns null for a day with no plan', async () => {
    const response = await get('2026-10-28');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: null });
  });

  it('rejects a GET with no tradeDate', async () => {
    const response = await get('');

    expect(response.status).toBe(400);
  });

  it('rejects a GET with no symbol', async () => {
    const response = await get('2026-10-28', '');

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors.symbol).toBeDefined();
  });

  it("answers null for another symbol's day", async () => {
    await put(plan);

    expect(await (await get('2026-10-28', 'qqq')).json()).toEqual({ plan: null });
  });

  it('saves and returns the plan for a day', async () => {
    const response = await put(plan);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      plan: {
        ...plan,
        htfDirection: null,
        htfFib50: null,
        htfFib100: null,
        asiaHigh: null,
        asiaLow: null,
        londonHigh: null,
        londonLow: null,
        premarketHigh: null,
        premarketLow: null,
        notes: null,
      },
    });

    expect((await (await get('2026-10-28')).json()).plan).toMatchObject({
      ltfFib50: 670.5,
      ltfFib100: 672,
    });
  });

  it('rejects an invalid plan with field errors', async () => {
    const response = await put({ ...plan, ltfFib100: 1 });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid daily plan');
    expect(body.fieldErrors.ltfFib100).toBeDefined();
  });
});
