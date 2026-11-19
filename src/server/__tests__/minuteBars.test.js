// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { fetchMinuteBarsBetween } from '../minuteBars';

const URL_ = 'https://data.alpaca.markets/v2/stocks/bars';
const bar = (t) => ({ t, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 });

beforeEach(() => {
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('fetchMinuteBarsBetween', () => {
  it('follows the page tokens until Alpaca has no more, and returns the bars oldest first', async () => {
    const requests = [];
    server.use(
      http.get(URL_, ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return requests.length === 1
          ? HttpResponse.json({ bars: { SPY: [bar('2026-01-02T14:30:00Z')] }, next_page_token: 'page2' })
          : HttpResponse.json({ bars: { SPY: [bar('2026-01-02T14:31:00Z')] }, next_page_token: null });
      })
    );

    const bars = await fetchMinuteBarsBetween('SPY', new Date('2026-01-01T05:00:00Z'), new Date('2026-01-03T05:00:00Z'));

    expect(bars.map((b) => b.t)).toEqual(['2026-01-02T14:30:00Z', '2026-01-02T14:31:00Z']);
    expect(Object.fromEntries(requests[0])).toMatchObject({
      symbols: 'SPY',
      timeframe: '1Min',
      start: '2026-01-01T05:00:00.000Z',
      end: '2026-01-03T05:00:00.000Z',
      adjustment: 'split',
      feed: 'iex',
    });
    expect(requests[0].has('page_token')).toBe(false);
    expect(requests[1].get('page_token')).toBe('page2');
  });

  it('returns no bars when Alpaca has none', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ bars: null, next_page_token: null })));
    expect(await fetchMinuteBarsBetween('SPY', new Date('2026-01-01T05:00:00Z'), new Date('2026-01-03T05:00:00Z'))).toEqual([]);
  });

  it('throws with the status when Alpaca refuses', async () => {
    server.use(http.get(URL_, () => new HttpResponse('forbidden', { status: 403 })));
    await expect(
      fetchMinuteBarsBetween('SPY', new Date('2026-01-01T05:00:00Z'), new Date('2026-01-03T05:00:00Z'))
    ).rejects.toThrow('403 from Alpaca');
  });
});
