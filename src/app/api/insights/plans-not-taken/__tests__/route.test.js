// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureErrorLogs } from '@/mocks/logs';
import { gatherPlansNotTaken } from '@/server/plansNotTaken';
import { GET } from '../route';

vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/server/plansNotTaken', () => ({ gatherPlansNotTaken: vi.fn() }));

const get = (query = '') => GET(new Request(`http://localhost/api/insights/plans-not-taken${query}`));
const result = { rows: [], plans: 0, neverTriggered: 0, replayed: 0 };

beforeEach(() => {
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
  gatherPlansNotTaken.mockReset().mockResolvedValue(result);
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/insights/plans-not-taken', () => {
  it("replays a year's unfilled option plans of a mode, New York years", async () => {
    const response = await get('?mode=paper&year=2026');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(gatherPlansNotTaken).toHaveBeenCalledWith('db', {
      mode: 'paper',
      from: new Date('2026-01-01T05:00:00Z'),
      to: new Date('2027-01-01T05:00:00Z'),
    });
  });

  it('gathers every year with year=all, and live by default', async () => {
    await get('?year=all');

    expect(gatherPlansNotTaken).toHaveBeenCalledWith('db', { mode: 'live', from: undefined, to: undefined });
  });

  it('rejects an unknown mode or year', async () => {
    const response = await get('?mode=dream&year=1');

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).fieldErrors).sort()).toEqual(['mode', 'year']);
  });

  it('logs a failed fetch and answers 502 with a reference, never the upstream detail', async () => {
    gatherPlansNotTaken.mockRejectedValue(new Error('403 from Alpaca: secret detail'));
    const logs = captureErrorLogs();

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).not.toContain('secret detail');
    expect(logs()).toEqual([expect.objectContaining({ message: 'Plans not taken failed', requestId: body.requestId })]);
  });

  it('says what is missing without the Alpaca keys', async () => {
    vi.stubEnv('ALPACA_KEY_ID', '');

    expect((await get()).status).toBe(500);
    expect(gatherPlansNotTaken).not.toHaveBeenCalled();
  });
});
