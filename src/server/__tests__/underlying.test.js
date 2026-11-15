// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { captureUnderlying } from '../underlying';

const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';

// A SPY call bought at 10:51:20 New York time on Oct 27, 2026.
const trade = {
  symbol: 'SPY',
  assetClass: 'option',
  optionType: 'call',
  direction: 'long',
  openedAt: new Date('2026-10-27T14:51:20Z'),
};

beforeEach(() => {
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('captureUnderlying', () => {
  it('fetches minute bars through the end of the minute holding the fill and takes its VWAP', async () => {
    const queries = [];
    server.use(
      http.get(BARS_URL, ({ request }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        const bar = (t, vw) => ({ t, o: 580, h: 580.3, l: 579.9, c: 580.1, v: 1000, vw });
        return HttpResponse.json({
          bars: { SPY: [bar('2026-10-27T14:50:00Z', 580.05), bar('2026-10-27T14:51:00Z', 580.12)] },
        });
      })
    );

    const result = await captureUnderlying(trade);

    expect(queries[0]).toMatchObject({ symbols: 'SPY', timeframe: '1Min', end: '2026-10-27T14:52:00.000Z' });
    // Too few bars for a band-cross setup, so nothing is derived.
    expect(result).toEqual({ entry: 580.12, derivedStop: null });
  });

  it('lets a failed fetch throw, for the caller to log', async () => {
    server.use(http.get(BARS_URL, () => HttpResponse.text('forbidden', { status: 403 })));

    await expect(captureUnderlying(trade)).rejects.toThrow('403 from Alpaca');
  });
});
