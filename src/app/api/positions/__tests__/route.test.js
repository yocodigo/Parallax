// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { captureErrorLogs } from '@/mocks/logs';
import { server } from '@/mocks/server';
import { GET } from '../route';

const get = () => GET(new Request('http://localhost/api/positions'));

const POSITIONS_URL = 'https://paper-api.alpaca.markets/v2/positions';

beforeEach(() => {
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/positions', () => {
  it('logs a failed request instead of dropping the error', async () => {
    server.use(http.get(POSITIONS_URL, () => HttpResponse.error()));
    const logs = captureErrorLogs();

    const response = await get();

    expect(response.status).toBe(502);
    const { requestId } = await response.json();
    expect(logs()).toEqual([
      expect.objectContaining({ message: 'Alpaca positions request failed', requestId, error: expect.any(Object) }),
    ]);
  });

  it("logs Alpaca's error response but returns only its status", async () => {
    server.use(
      http.get(POSITIONS_URL, () => HttpResponse.json({ message: 'forbidden detail' }, { status: 403 }))
    );
    const logs = captureErrorLogs();

    const response = await get();

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('forbidden detail');
    expect(logs()).toEqual([
      expect.objectContaining({
        message: 'Alpaca positions error',
        requestId: body.requestId,
        status: 403,
        detail: expect.stringContaining('forbidden detail'),
      }),
    ]);
  });
});
