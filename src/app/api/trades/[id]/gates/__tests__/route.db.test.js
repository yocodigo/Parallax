import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { getDb } from '@/db';
import { addJournalEntry } from '@/db/journal';
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

// Times on the fixture's trading days, the clock the gates keep.
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

// The previous session: 26 15m bars, flat, so the fill day's cross and
// dealing range read entirely from the fill day's own bars.
const PREVIOUS_SESSION = minuteBars(PREV_DAY_OPEN, Array.from({ length: 78 }, () => flat(10)));

// The fill day: flat until index 6 dips to a swing low of 9.5 and index 10
// peaks at a swing high of 10.8, then index 14 closes at 12, above the middle
// band, crossing long. Index 14 is the last 5m bar closed before a 10:47
// fill and barely overlaps index 13.
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
  { o: 11.5, h: 12.04, l: 11.05, c: 11.6 },
];
const BARS = [...PREVIOUS_SESSION, ...minuteBars(FILL_DAY_OPEN, FILL_SESSION_SPECS)];

const openTrade = {
  mode: 'paper',
  symbol: 'SPY',
  assetClass: 'stock',
  direction: 'long',
  quantity: 100,
  entryPrice: 12,
  stopRule: 'S2',
  openedAt: new Date('2026-10-27T14:47:00Z'),
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
  GET(new Request(`http://localhost/api/trades/${id}/gates`), { params: Promise.resolve({ id }) });

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

describe('GET /api/trades/[id]/gates', () => {
  it("grades a trade's pre-entry gates from its bars", async () => {
    const trade = await insertTrade();
    const queries = serveBars('SPY', BARS);
    await addJournalEntry(getDb(), {
      kind: 'plan',
      tradeId: trade.id,
      notes: 'Bull flag on the daily.',
      emotion: 'calm',
    });

    const response = await get(trade.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      gates: {
        window: 'unknown',
        direction: 'met',
        entry: 'met',
        location: 'met',
        target: 'missed',
        state: 'met',
        stop: 'met',
      },
    });
    expect(queries[0]).toMatchObject({
      symbols: 'SPY',
      timeframe: '1Min',
      end: '2026-10-27T14:47:00.000Z',
      adjustment: 'split',
    });
  });

  it('says met for the target gate when the day was planned', async () => {
    const trade = await insertTrade();
    serveBars('SPY', BARS);
    await getDb().insert(dailyPlans).values({
      tradeDate: '2026-10-27',
      ltfDirection: 'bullish',
      ltfFib50: 11,
      ltfFib100: 12,
    });

    const response = await get(trade.id);

    expect((await response.json()).gates.target).toBe('met');
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
    });
    serveBars('SPY', BARS);

    const response = await get(trade.id);

    expect(response.status).toBe(200);
    expect((await response.json()).gates).toMatchObject({ direction: 'met', size: 'met' });
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
    expect(await response.json()).toMatchObject({ gates: null });
  });
});
