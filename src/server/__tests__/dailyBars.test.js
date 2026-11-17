// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { fetchDailyBars } from '../dailyBars';

const URL_ = 'https://data.alpaca.markets/v2/stocks/bars';

beforeEach(() => {
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('fetchDailyBars', () => {
  it('asks for three weeks of daily bars ending the day before, and returns them oldest first', async () => {
    const requests = [];
    server.use(
      http.get(URL_, ({ request }) => {
        requests.push(request);
        return HttpResponse.json({ bars: { SPY: [{ t: '2026-11-16T05:00:00Z', o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }] } });
      })
    );

    const bars = await fetchDailyBars('SPY', '2026-11-17');

    expect(Object.fromEntries(new URL(requests[0].url).searchParams)).toMatchObject({
      symbols: 'SPY',
      timeframe: '1Day',
      start: '2026-10-27',
      end: '2026-11-16',
      adjustment: 'split',
      feed: 'iex',
    });
    expect(requests[0].headers.get('APCA-API-KEY-ID')).toBe('key');
    expect(bars).toEqual([{ t: '2026-11-16T05:00:00Z', o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }]);
  });

  it('returns no bars when Alpaca has none', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ bars: {} })));
    expect(await fetchDailyBars('SPY', '2026-11-17')).toEqual([]);
  });

  it('throws with the status when Alpaca refuses', async () => {
    server.use(http.get(URL_, () => new HttpResponse('forbidden', { status: 403 })));
    await expect(fetchDailyBars('SPY', '2026-11-17')).rejects.toThrow('403 from Alpaca');
  });
});
