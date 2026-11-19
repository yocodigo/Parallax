// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureErrorLogs } from '@/mocks/logs';
import { gatherLevelReactions } from '@/server/levelReactions';
import { GET } from '../route';

vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/server/levelReactions', () => ({ gatherLevelReactions: vi.fn() }));

const get = (query = '') => GET(new Request(`http://localhost/api/insights/level-reactions${query}`));
const result = { symbol: 'QQQ', year: 2026, sessions: 0, kinds: [] };

beforeEach(() => {
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
  gatherLevelReactions.mockReset().mockResolvedValue(result);
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/insights/level-reactions', () => {
  it("gathers one symbol's year, the symbol in capitals", async () => {
    const response = await get('?symbol=qqq&year=2026');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(gatherLevelReactions).toHaveBeenCalledWith('db', { symbol: 'QQQ', year: 2026 });
  });

  it('defaults to SPY and the current New York year', async () => {
    await get();

    const { symbol, year } = gatherLevelReactions.mock.calls[0][1];
    expect(symbol).toBe('SPY');
    expect(year).toBe(Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date())));
  });

  it('rejects all years and a bad symbol: a reaction needs one symbol and one year', async () => {
    const response = await get('?symbol=%24%24&year=all');

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).fieldErrors).sort()).toEqual(['symbol', 'year']);
  });

  it('logs a failed fetch and answers 502 with a reference, never the upstream detail', async () => {
    gatherLevelReactions.mockRejectedValue(new Error('403 from Alpaca: secret detail'));
    const logs = captureErrorLogs();

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).not.toContain('secret detail');
    expect(logs()).toEqual([expect.objectContaining({ message: 'Level reactions failed', requestId: body.requestId })]);
  });

  it('says what is missing without the Alpaca keys', async () => {
    vi.stubEnv('ALPACA_KEY_ID', '');

    const response = await get();

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('ALPACA_KEY_ID');
    expect(gatherLevelReactions).not.toHaveBeenCalled();
  });
});
