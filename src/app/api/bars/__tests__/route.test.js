// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { captureErrorLogs } from '@/mocks/logs';
import { server } from '@/mocks/server';
import { GET } from '../route';

const BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';

const get = () => GET(new Request('http://localhost/api/bars?symbols=AAPL&days=30'));

beforeEach(() => {
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/bars', () => {
  it('logs a failed request instead of dropping the error', async () => {
    server.use(http.get(BARS_URL, () => HttpResponse.error()));
    const logs = captureErrorLogs();

    const response = await get();

    expect(response.status).toBe(502);
    const { requestId } = await response.json();
    expect(logs()).toEqual([
      expect.objectContaining({ message: 'Alpaca bars request failed', requestId, error: expect.any(Object) }),
    ]);
  });
});
