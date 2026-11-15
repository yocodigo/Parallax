// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { fetchOptionBars } from '../optionBars';

const URL_ = 'https://data.alpaca.markets/v1beta1/options/bars';

beforeEach(() => {
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('fetchOptionBars', () => {
  it("asks for the contract's minute bars over the window and returns them oldest first", async () => {
    const queries = [];
    server.use(
      http.get(URL_, ({ request }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return HttpResponse.json({ bars: { SPY261104C00768000: [{ t: '2026-11-04T15:15:00Z', o: 2, h: 2.05, l: 1.9, c: 2 }] } });
      })
    );

    const bars = await fetchOptionBars('SPY261104C00768000', new Date('2026-11-04T15:15:00Z'), new Date('2026-11-04T15:21:00Z'));

    expect(queries[0]).toMatchObject({
      symbols: 'SPY261104C00768000',
      timeframe: '1Min',
      start: '2026-11-04T15:15:00.000Z',
      end: '2026-11-04T15:21:00.000Z',
    });
    expect(bars).toHaveLength(1);
  });

  it('returns no bars for a contract with none in the window', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ bars: {} })));

    expect(await fetchOptionBars('MSFT261113C00540000', new Date(), new Date())).toEqual([]);
  });

  it('throws on a failed request, for the caller to log', async () => {
    server.use(http.get(URL_, () => HttpResponse.text('nope', { status: 403 })));

    await expect(fetchOptionBars('X', new Date(), new Date())).rejects.toThrow('403 from Alpaca');
  });
});
