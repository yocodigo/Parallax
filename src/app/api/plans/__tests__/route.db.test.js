import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { captureErrorLogs } from '@/mocks/logs';
import { POST } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const plan = {
  mode: 'paper',
  symbol: 'spy',
  assetClass: 'stock',
  direction: 'long',
  quantity: 10,
  plannedEntry: 100,
  initialStop: 98,
  target: 106,
};

const post = (body) =>
  POST(new Request('http://localhost/api/plans', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => resetDb(getDb()));
afterEach(() => vi.restoreAllMocks());
afterAll(() => getDb().$client.end());

describe('POST /api/plans', () => {
  it('saves a valid plan with its journal entry', async () => {
    const response = await post({ plan, entry: { notes: 'Bull flag on the daily.', emotion: 'calm' } });

    expect(response.status).toBe(201);
    const { trade, entry } = await response.json();
    expect(trade).toMatchObject({ symbol: 'SPY', initialStop: 98, multiplier: 1 });
    expect(entry).toMatchObject({ kind: 'plan', tradeId: trade.id, emotion: 'calm' });
  });

  it('rejects a stop on the wrong side and saves nothing', async () => {
    const response = await post({ plan: { ...plan, initialStop: 101 }, entry: { notes: 'Typo' } });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.fieldErrors.plan).toHaveProperty('initialStop');
    expect(await getDb().select().from(trades)).toHaveLength(0);
  });

  it('rejects a plan without notes', async () => {
    const response = await post({ plan, entry: { notes: '' } });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.fieldErrors.entry).toHaveProperty('notes');
  });
});
describe('when the database fails', () => {
  it('logs the error and answers with JSON and a request id', async () => {
    vi.spyOn(getDb(), 'transaction').mockRejectedValue(new Error('connection terminated'));
    const logs = captureErrorLogs();

    const response = await post({ plan, entry: { notes: 'Bull flag on the daily.' } });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.requestId).toEqual(expect.any(String));
    expect(logs()).toEqual([expect.objectContaining({ route: '/api/plans', requestId: body.requestId })]);
  });
});
