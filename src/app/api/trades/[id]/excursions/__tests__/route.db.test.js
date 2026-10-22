import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { getDb } from '@/db';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { captureErrorLogs } from '@/mocks/logs';
import { server } from '@/mocks/server';
import { GET } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';

// Long NVDA filled at 100 with a stop at 98, held about a day.
const closedTrade = {
  mode: 'paper',
  symbol: 'NVDA',
  assetClass: 'stock',
  direction: 'long',
  quantity: 10,
  plannedEntry: 100,
  entryPrice: 100,
  initialStop: 98,
  exitPrice: 104,
  openedAt: new Date('2026-10-20T14:31:45Z'),
  closedAt: new Date('2026-10-21T15:00:00Z'),
};

async function insertTrade(values = {}) {
  const [trade] = await getDb().insert(trades).values({ ...closedTrade, ...values }).returning();
  return trade;
}

// Answer bar requests with these bars and record each request's query.
function serveBars(bars) {
  const queries = [];
  server.use(
    http.get(BARS_URL, ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json({ bars: { NVDA: bars }, next_page_token: null });
    })
  );
  return queries;
}

const get = (id) =>
  GET(new Request(`http://localhost/api/trades/${id}/excursions`), { params: Promise.resolve({ id }) });

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

describe('GET /api/trades/[id]/excursions', () => {
  it('measures MAE and MFE from the bars the trade was open for', async () => {
    const trade = await insertTrade();
    const queries = serveBars([
      { t: '2026-10-20T14:31:00Z', o: 100, h: 101, l: 99, c: 100.5 },
      { t: '2026-10-21T14:59:00Z', o: 103, h: 105, l: 98.5, c: 104 },
    ]);

    const response = await get(trade.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      excursions: { mae: 1.5, mfe: 5, maeR: 0.75, mfeR: 2.5 },
      timeframe: '1Min',
    });
    expect(queries[0]).toMatchObject({
      symbols: 'NVDA',
      timeframe: '1Min',
      start: '2026-10-20T14:31:00.000Z',
      end: '2026-10-21T15:00:00.000Z',
      // Fills are real prices of the day, so bars must not be split-adjusted.
      adjustment: 'raw',
    });
  });

  it('says why when there is nothing to measure', async () => {
    const option = await insertTrade({ assetClass: 'option', multiplier: 100 });
    const quiet = await insertTrade();
    serveBars([]);

    expect(await (await get(option.id)).json()).toEqual({
      excursions: null,
      reason: 'MAE and MFE are only available for stocks so far',
    });
    expect(await (await get(quiet.id)).json()).toEqual({
      excursions: null,
      reason: 'No price bars for the time the trade was open',
    });
  });

  it('refuses a trade with no entry yet', async () => {
    const planned = await insertTrade({
      entryPrice: null,
      exitPrice: null,
      openedAt: null,
      closedAt: null,
    });

    const response = await get(planned.id);

    expect(response.status).toBe(409);
  });

  it('logs a failed bar request and answers with a reference', async () => {
    const trade = await insertTrade();
    server.use(http.get(BARS_URL, () => HttpResponse.json({ message: 'forbidden' }, { status: 403 })));
    const logs = captureErrorLogs();

    const response = await get(trade.id);

    expect(response.status).toBe(502);
    const { requestId } = await response.json();
    expect(logs()).toEqual([
      expect.objectContaining({ message: 'Alpaca bars error', requestId, status: 403 }),
    ]);
  });

  it('answers 404 for a trade that does not exist', async () => {
    expect((await get('00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});
