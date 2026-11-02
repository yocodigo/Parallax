import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { getDb } from '@/db';
import { dailyPlans, trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { server } from '@/mocks/server';
import { GET } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';
const MINUTE = 60_000;
const OPEN = Date.parse('2026-10-27T13:30:00Z');

const bar = (o, h, l, c) => ({ o, h, l, c });
// Twenty quiet bars below 100 (9:30 to 9:49), then price reaches 100 at 9:50
// and closes back under it at 9:51: a rejection at T1, decided when the 9:51
// bar closes at 9:52.
const BAR_SPECS = [
  ...Array.from({ length: 20 }, (_, k) => (k % 2 ? bar(98.2, 98.7, 97.7, 98) : bar(98, 98.5, 97.5, 98.2))),
  bar(98.1, 100, 98, 99.8),
  bar(99.8, 99.9, 99.2, 99.3),
];
const BARS = BAR_SPECS.map((b, k) => ({ t: new Date(OPEN + k * MINUTE).toISOString(), v: 100, ...b }));

const closedTrade = {
  mode: 'paper',
  symbol: 'SPY',
  assetClass: 'stock',
  direction: 'long',
  quantity: 100,
  entryPrice: 98.2,
  exitPrice: 99.3,
  openedAt: new Date('2026-10-27T13:50:00Z'),
  closedAt: new Date('2026-10-27T13:52:00Z'),
  exitReason: 'fib_rejection',
};

const plan = { tradeDate: '2026-10-27', ltfDirection: 'bullish', ltfFib50: 100, ltfFib100: 102 };

async function insertTrade(values = {}) {
  const [trade] = await getDb().insert(trades).values({ ...closedTrade, ...values }).returning();
  return trade;
}

function serveBars(symbol, bars) {
  const queries = [];
  server.use(
    http.get(BARS_URL, ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json({ bars: { [symbol]: bars }, next_page_token: null });
    })
  );
  return queries;
}

const get = (id) =>
  GET(new Request(`http://localhost/api/trades/${id}/exit-review`), { params: Promise.resolve({ id }) });

// The db project has no shared MSW setup, so this file runs its own.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await resetDb(getDb());
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
});
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(async () => {
  server.close();
  await getDb().$client.end();
});

describe('GET /api/trades/[id]/exit-review', () => {
  it("reviews a closed trade's exit against the day's fib", async () => {
    const trade = await insertTrade();
    await getDb().insert(dailyPlans).values(plan);
    const queries = serveBars('SPY', BARS);

    const response = await get(trade.id);

    expect(response.status).toBe(200);
    expect((await response.json()).review).toMatchObject({
      bias: 'long',
      t1: 100,
      t2: 102,
      skipped: null,
      reaction: { kind: 'rejected' },
      exitUnderlying: 99.3,
      verdict: 'matched',
    });
    // Bars run on past the exit, a day from the fill, since the reaction at T1
    // is graded after it.
    expect(queries[0]).toMatchObject({
      symbols: 'SPY',
      timeframe: '1Min',
      end: '2026-10-28T13:50:00.000Z',
      adjustment: 'split',
    });
  });

  it('says why a day with no plan has no reaction to grade', async () => {
    const trade = await insertTrade();
    serveBars('SPY', BARS);

    const response = await get(trade.id);

    expect(response.status).toBe(200);
    expect((await response.json()).review).toMatchObject({ skipped: 'no_daily_plan', verdict: null });
  });

  it('reads the underlying for an option trade', async () => {
    const trade = await insertTrade({
      assetClass: 'option',
      optionType: 'call',
      strike: 600,
      expiration: '2026-10-27',
      multiplier: 100,
      quantity: 2,
      entryPrice: 1.5,
      exitPrice: 1.2,
    });
    await getDb().insert(dailyPlans).values(plan);
    serveBars('SPY', BARS);

    const response = await get(trade.id);

    expect(response.status).toBe(200);
    expect((await response.json()).review).toMatchObject({ bias: 'long', verdict: 'matched' });
  });

  it('404s for a trade that does not exist', async () => {
    const response = await get('00000000-0000-0000-0000-000000000000');
    expect(response.status).toBe(404);
  });

  it('409s for a trade that is not closed yet', async () => {
    const trade = await insertTrade({ closedAt: null, exitPrice: null, exitReason: null });
    const response = await get(trade.id);
    expect(response.status).toBe(409);
  });

  it('says why for a crypto trade', async () => {
    const trade = await insertTrade({ symbol: 'BTC/USD', assetClass: 'crypto' });
    const response = await get(trade.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ review: null });
  });
});
