// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { GET } from '../route';

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
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(502);
    expect(consoleError).toHaveBeenCalledWith('Alpaca positions request failed', expect.any(Error));
  });

  it("logs Alpaca's error response but returns only its status", async () => {
    server.use(
      http.get(POSITIONS_URL, () => HttpResponse.json({ message: 'forbidden detail' }, { status: 403 }))
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain('forbidden detail');
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('forbidden detail'));
  });
});
