// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { captureErrorLogs } from '@/mocks/logs';
import { server } from '@/mocks/server';
import { captureContext } from '../marketContext';

const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';
const VIX_URL = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';
const SNAPSHOT_URL = 'https://data.alpaca.markets/v1beta1/options/snapshots';
const CONTRACT_URL = 'https://paper-api.alpaca.markets/v2/options/contracts/:symbol';

// Entered at 10:30 AM New York time on Tuesday, Oct 20, 2026.
const openedAt = new Date('2026-10-20T14:30:00Z');
const stockTrade = { symbol: 'NVDA', assetClass: 'stock', openedAt };

// 60 days of bars ending Oct 19, real dates since the level map reads them.
const daily = (last) =>
  Array.from({ length: 60 }, (_, i) => ({
    t: new Date(Date.parse('2026-10-19T04:00:00Z') - (59 - i) * 86_400_000).toISOString(),
    h: last - 59 + i,
    l: last - 59 + i,
    c: last - 59 + i,
    v: 1_000_000,
  }));
const minute = (price) => [{ t: '2026-10-20T14:29:00Z', o: price, c: price, v: 1000 }];

// Serve bars by timeframe and record each request's query.
function serveBars() {
  const queries = [];
  server.use(
    http.get(BARS_URL, ({ request }) => {
      const query = Object.fromEntries(new URL(request.url).searchParams);
      queries.push(query);
      const bars = query.timeframe === '1Day'
        ? { SPY: daily(560), QQQ: daily(480), NVDA: daily(180) }
        : { SPY: minute(562), QQQ: minute(482), NVDA: minute(190) };
      return HttpResponse.json({ bars, next_page_token: null });
    })
  );
  return queries;
}

const serveVix = () =>
  server.use(http.get(VIX_URL, () => HttpResponse.text('DATE,OPEN,HIGH,LOW,CLOSE\n10/19/2026,17,17,17,17.000000\n')));

beforeEach(() => {
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('captureContext', () => {
  it('fetches the bars and VIX it needs and builds the snapshot', async () => {
    const queries = serveBars();
    serveVix();

    const context = await captureContext(stockTrade, { now: openedAt });

    expect(context.market).toMatchObject({ spyTrend: 'up', qqqTrend: 'up', vix: { close: 17 } });
    expect(context.stock).toMatchObject({ symbol: 'NVDA', price: 190, trend: 'up' });

    const dailyQuery = queries.find((q) => q.timeframe === '1Day');
    expect(dailyQuery).toMatchObject({ symbols: 'SPY,QQQ,NVDA', end: '2026-10-19', adjustment: 'split' });
    const minuteQuery = queries.find((q) => q.timeframe === '1Min');
    // Only bars up to the entry, so nothing after it leaks into the snapshot.
    expect(minuteQuery).toMatchObject({ end: '2026-10-20T14:30:00.000Z', adjustment: 'split' });
  });

  it("fetches the underlying's own minute bars for its setups and level map, with the day's plan", async () => {
    const queries = serveBars();
    serveVix();

    const context = await captureContext(stockTrade, { now: openedAt, dailyPlan: { premarketHigh: 195 } });

    // Five days back, for a previous session's 15m bands, and up to the entry.
    expect(queries).toContainEqual(
      expect.objectContaining({
        symbols: 'NVDA',
        timeframe: '1Min',
        start: '2026-10-15T14:30:00.000Z',
        end: '2026-10-20T14:30:00.000Z',
      })
    );
    expect(context.version).toBe(3);
    expect(context.setups).toEqual({ fourTouch: null, detected: [] });
    expect(context.levels).toContainEqual(expect.objectContaining({ kind: 'premarket_high', price: 195 }));
    expect(context.levels).toContainEqual(expect.objectContaining({ kind: 'prior_day_high', price: 180 }));
  });

  it("leaves the setups and levels out, and keeps the rest, when the underlying's own bars fail", async () => {
    serveBars();
    serveVix();
    server.use(
      http.get(BARS_URL, ({ request }) =>
        new URL(request.url).searchParams.get('symbols') === 'NVDA' ? new HttpResponse('down', { status: 503 }) : undefined
      )
    );
    const logs = captureErrorLogs();

    const context = await captureContext(stockTrade, { now: openedAt, requestId: 'req-2' });

    expect(context).toMatchObject({ setups: null, levels: null, stock: { price: 190 }, market: { vix: { close: 17 } } });
    expect(logs()).toEqual([
      expect.objectContaining({ message: 'Context source failed', source: 'underlyingMinuteBars', requestId: 'req-2' }),
    ]);
  });

  it('logs a source that fails and leaves its part empty', async () => {
    serveBars();
    server.use(http.get(VIX_URL, () => new HttpResponse('down', { status: 503 })));
    const logs = captureErrorLogs();

    const context = await captureContext(stockTrade, { now: openedAt, requestId: 'req-1' });

    expect(context.market.vix).toBeNull();
    expect(context.stock.price).toBe(190);
    expect(logs()).toEqual([
      expect.objectContaining({ message: 'Context source failed', source: 'vix', requestId: 'req-1' }),
    ]);
  });

  it("fetches an option's open interest and live snapshot", async () => {
    serveBars();
    serveVix();
    const contract = 'NVDA261023C00195000';
    server.use(
      http.get(CONTRACT_URL, ({ params }) =>
        HttpResponse.json({ symbol: params.symbol, open_interest: '12000', open_interest_date: '2026-10-19' })
      ),
      http.get(SNAPSHOT_URL, () =>
        HttpResponse.json({
          snapshots: {
            [contract]: { latestQuote: { bp: 1.9, ap: 2.1 }, impliedVolatility: 0.5, greeks: { delta: 0.42 } },
          },
        })
      )
    );

    const context = await captureContext(
      { ...stockTrade, assetClass: 'option', optionType: 'call', strike: 195, expiration: '2026-10-23' },
      { now: new Date('2026-10-20T14:35:00Z') }
    );

    expect(context.option).toMatchObject({
      contract,
      openInterest: 12000,
      bid: 1.9,
      ask: 2.1,
      iv: 0.5,
      delta: 0.42,
      liveSkipped: false,
    });
  });
});
