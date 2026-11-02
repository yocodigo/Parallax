import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { getDb } from '@/db';
import { trades } from '@/db/schema';
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

const PREV_DAY_OPEN = Date.parse('2026-10-26T13:30:00Z');
const FILL_DAY_OPEN = Date.parse('2026-10-27T13:30:00Z');

function fiveMinute(start, { o, h, l, c, v = 500 }) {
  const minute = (k, bar) => ({ t: new Date(start + k * MINUTE).toISOString(), v: v / 5, ...bar });
  return [
    minute(0, { o, h: o, l: o, c: o }),
    minute(1, { o, h, l: o, c: o }),
    minute(2, { o, h: o, l, c: o }),
    minute(3, { o, h: o, l: o, c: o }),
    minute(4, { o, h: Math.max(o, c), l: Math.min(o, c), c }),
  ];
}
const minuteBars = (open, specs) => specs.flatMap((spec, k) => fiveMinute(open + k * 5 * MINUTE, spec));
const flat = (price) => ({ o: price, h: price + 0.1, l: price - 0.1, c: price });

// The previous session: 26 15m bars, flat, so the fill day's cross reads
// entirely from the fill day's own bars.
const PREVIOUS_SESSION = minuteBars(PREV_DAY_OPEN, Array.from({ length: 78 }, () => flat(10)));

// The fill day: flat, a dip and a peak, then index 14 closes at 12, above the
// middle band, crossing long. Index 15 (10:45-10:50) is the entry candle: an
// up bar that doesn't overlap index 14, on more volume.
const FILL_SESSION_SPECS = [
  flat(10),
  flat(10),
  flat(10),
  flat(10),
  flat(10),
  flat(10),
  { o: 10, h: 10.05, l: 9.5, c: 9.9 },
  { o: 9.9, h: 10.1, l: 9.85, c: 10 },
  flat(10),
  { o: 10, h: 10.2, l: 9.95, c: 10.1 },
  { o: 10.1, h: 10.8, l: 10.05, c: 10.2 },
  { o: 10.2, h: 10.3, l: 10.12, c: 10 },
  { o: 10.15, h: 10.6, l: 10.1, c: 10.5 },
  { o: 10.2, h: 11.05, l: 10.2, c: 11 },
  { o: 11.02, h: 12.05, l: 11, c: 12 },
  { o: 12.1, h: 12.6, l: 12.05, c: 12.5, v: 800 },
  { o: 12.8, h: 12.9, l: 12.7, c: 12.85 },
];
const BARS = [...PREVIOUS_SESSION, ...minuteBars(FILL_DAY_OPEN, FILL_SESSION_SPECS)];

const openTrade = {
  mode: 'paper',
  symbol: 'SPY',
  assetClass: 'stock',
  direction: 'long',
  quantity: 100,
  entryPrice: 12.8,
  openedAt: new Date('2026-10-27T14:53:00Z'),
};

async function insertTrade(values = {}) {
  const [trade] = await getDb().insert(trades).values({ ...openTrade, ...values }).returning();
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
  GET(new Request(`http://localhost/api/trades/${id}/review`), { params: Promise.resolve({ id }) });

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

describe('GET /api/trades/[id]/review', () => {
  it("reviews a trade's entry from its bars", async () => {
    const trade = await insertTrade();
    const queries = serveBars('SPY', BARS);

    const response = await get(trade.id);

    expect(response.status).toBe(200);
    const { review } = await response.json();
    expect(review).toMatchObject({
      bias: 'long',
      setup: { name: 'band_cross', idealEntry: 12.5, risingVolume: true },
      entryCandle: { overlap: 0, risingVolume: true },
      inLockout: false,
      pressureDate: false,
      seasonalDate: null,
    });
    expect(review.chaseR).toBeCloseTo(0.3 / 0.45);
    expect(queries[0]).toMatchObject({
      symbols: 'SPY',
      timeframe: '1Min',
      end: '2026-10-27T14:53:00.000Z',
      adjustment: 'split',
    });
  });

  it('reads the underlying for an option trade, so a bought put goes against the cross', async () => {
    const trade = await insertTrade({
      assetClass: 'option',
      optionType: 'put',
      strike: 600,
      expiration: '2026-10-27',
      multiplier: 100,
      quantity: 2,
      entryPrice: 1.5,
    });
    serveBars('SPY', BARS);

    const response = await get(trade.id);

    expect(response.status).toBe(200);
    expect((await response.json()).review).toMatchObject({ bias: 'short', setup: null, chaseR: null });
  });

  it('404s for a trade that does not exist', async () => {
    const response = await get('00000000-0000-0000-0000-000000000000');
    expect(response.status).toBe(404);
  });

  it('409s for a plan with no entry yet', async () => {
    const trade = await insertTrade({ openedAt: null, entryPrice: null });
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
