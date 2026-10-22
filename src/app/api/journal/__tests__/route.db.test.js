import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { resetDb } from '@/db/testing';
import { captureErrorLogs } from '@/mocks/logs';
import { GET, POST } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const post = (body) =>
  POST(new Request('http://localhost/api/journal', { method: 'POST', body: JSON.stringify(body) }));

const get = () => GET(new Request('http://localhost/api/journal'));

beforeEach(() => resetDb(getDb()));
afterEach(() => vi.restoreAllMocks());
afterAll(() => getDb().$client.end());

describe('POST /api/journal', () => {
  it('saves a valid entry and returns it', async () => {
    const response = await post({
      kind: 'review',
      notes: 'Held past my target.',
      mistakes: ['held_past_target'],
    });

    expect(response.status).toBe(201);
    const { entry } = await response.json();
    expect(entry).toMatchObject({ kind: 'review', mistakes: ['held_past_target'] });
  });

  it('rejects an invalid entry with field errors', async () => {
    const response = await post({ kind: 'review', notes: '   ' });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.fieldErrors).toHaveProperty('notes');
  });

  it('rejects a body that is not JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/journal', { method: 'POST', body: 'not json' })
    );

    expect(response.status).toBe(400);
  });
});

describe('GET /api/journal', () => {
  it('lists saved entries', async () => {
    await post({ kind: 'review', notes: 'First' });
    await post({ kind: 'review', notes: 'Second' });

    const response = await get();

    expect(response.status).toBe(200);
    const { entries } = await response.json();
    expect(entries.map((entry) => entry.notes).sort()).toEqual(['First', 'Second']);
  });
});
describe('when the database fails', () => {
  it('logs the error and answers with JSON and a request id', async () => {
    vi.spyOn(getDb(), 'insert').mockImplementation(() => {
      throw new Error('connection terminated');
    });
    const logs = captureErrorLogs();

    const response = await post({ kind: 'review', notes: 'Held past my target.' });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Something went wrong. Try again.', requestId: expect.any(String) });
    expect(logs()).toEqual([
      expect.objectContaining({ route: '/api/journal', requestId: body.requestId }),
    ]);
  });
});
