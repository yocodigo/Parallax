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
const MINUTE = 60_000;
const OPEN = Date.parse('2026-10-26T13:30:00Z');

// 130 flat SPY minutes from the 9:30 open. Bar 110 is the fill bar (1R is
// 0.6, down to its 499.8 low) and bar 112 closes through that low.
const spyBars = Array.from({ length: 130 }, (_, k) => {
  const bar = { o: 500, h: 500.5, l: 499.5, c: 500 };
  if (k === 110) Object.assign(bar, { h: 500.6, l: 499.8, c: 500.4 });
  if (k > 110) Object.assign(bar, { o: 500.3, h: 500.5, l: 500.2, c: 500.3 });
  if (k === 112) Object.assign(bar, { h: 500.3, l: 499.6, c: 499.7 });
  return { t: new Date(OPEN + k * MINUTE).toISOString(), ...bar, v: 1000 };
});

// Serve the bars and record each request.
function serveBars(response = () => HttpResponse.json({ bars: { SPY: spyBars }, next_page_token: null })) {
  const requests = [];
  server.use(
    http.get(BARS_URL, ({ request }) => {
      requests.push(new URL(request.url));
      return response();
    })
  );
  return requests;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// A closed call on `symbol`, filled 20 seconds into bar `minute`, `days` days
// after the bars' day.
async function closedCall({ symbol = 'SPY', mode = 'live', minute = 110, days = 0 } = {}) {
  const openedAt = new Date(OPEN + days * DAY_MS + minute * MINUTE + 20_000);
  const [trade] = await getDb()
    .insert(trades)
    .values({
      mode,
      symbol,
      assetClass: 'option',
      direction: 'long',
      optionType: 'call',
      strike: 500,
      expiration: '2026-10-26',
      quantity: 1,
      plannedEntry: 1.2,
      entryPrice: 1.2,
      exitPrice: 1,
      openedAt,
      closedAt: new Date(openedAt.getTime() + 5 * MINUTE),
    })
    .returning();
  return trade;
}

const get = (query = '') => GET(new Request(`http://localhost/api/insights/stops${query}`));

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
});
afterAll(async () => {
  server.close();
  await getDb().$client.end();
});

describe('GET /api/insights/stops', () => {
  it("replays closed SPY trades under S1, S2, and both, on each trade day's SPY minutes", async () => {
    const requests = serveBars();
    await closedCall();
    await closedCall({ symbol: 'QQQ' });

    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ replayed: 1, skipped: 0 });
    expect(body.ruleSets.map((set) => [set.rules, set.byReason])).toEqual([
      [['S1'], { close: 1 }],
      [['S2'], { S2: 1 }],
      [['S1', 'S2'], { S2: 1 }],
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get('symbols')).toBe('SPY');
    expect(requests[0].searchParams.get('timeframe')).toBe('1Min');
  });

  it('fetches each trading day once, for every trade that day', async () => {
    const requests = serveBars();
    await closedCall();
    await closedCall({ minute: 115 });

    expect(await (await get()).json()).toMatchObject({ replayed: 2, skipped: 0 });
    expect(requests).toHaveLength(1);
  });

  it("fetches another day separately, and skips a trade the day's bars don't cover", async () => {
    // The fake feed only has the first day, so the next day's trade has no bars.
    const requests = serveBars();
    await closedCall();
    await closedCall({ days: 1 });

    expect(await (await get()).json()).toMatchObject({ replayed: 1, skipped: 1 });
    expect(requests).toHaveLength(2);
  });

  it('asks for the bars from 4 days before the entry to a day after it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    try {
      const requests = serveBars();
      const trade = await closedCall();
      await get();

      const params = requests[0].searchParams;
      expect(params.get('start')).toBe(new Date(trade.openedAt.getTime() - 4 * DAY_MS).toISOString());
      expect(params.get('end')).toBe(new Date(trade.openedAt.getTime() + DAY_MS).toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it("follows Alpaca's pages", async () => {
    const requests = serveBars();
    server.use(
      http.get(BARS_URL, ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const second = url.searchParams.get('page_token') === 'next';
        return HttpResponse.json({
          bars: { SPY: second ? spyBars.slice(100) : spyBars.slice(0, 100) },
          next_page_token: second ? null : 'next',
        });
      })
    );
    await closedCall();

    const body = await (await get()).json();
    expect(requests).toHaveLength(2);
    expect(body.ruleSets[1].byReason).toEqual({ S2: 1 });
  });

  it('can be limited to one mode', async () => {
    serveBars();
    await closedCall({ mode: 'paper' });

    expect(await (await get('?mode=live')).json()).toMatchObject({ replayed: 0, skipped: 0 });
  });

  it('asks Alpaca for nothing when there are no trades', async () => {
    const requests = serveBars();
    const body = await (await get()).json();
    expect(body.replayed).toBe(0);
    expect(requests).toHaveLength(0);
  });

  it('rejects an unknown mode', async () => {
    const response = await get('?mode=dream');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Invalid mode', fieldErrors: { mode: expect.any(Array) } });
  });

  it('answers 502 and logs it when Alpaca fails', async () => {
    serveBars(() => new HttpResponse('rate limited', { status: 429 }));
    await closedCall();
    const logs = captureErrorLogs();

    const response = await get();
    expect(response.status).toBe(502);
    const body = await response.json();
    const entries = logs();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ route: '/api/insights/stops', requestId: body.requestId, status: 429 });
  });

  it('answers 500 without Alpaca keys', async () => {
    vi.stubEnv('ALPACA_KEY_ID', '');
    await closedCall();

    expect((await get()).status).toBe(500);
  });
});
