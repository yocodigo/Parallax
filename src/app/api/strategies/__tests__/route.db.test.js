import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { resetDb } from '@/db/testing';
import { GET, POST } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const strategy = {
  name: '15m BB acceptance',
  rules: [{ text: 'Accepted above the 15m band', kind: 'edge' }],
};

const post = (body) =>
  POST(new Request('http://localhost/api/strategies', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('/api/strategies', () => {
  it('creates a strategy and lists it', async () => {
    const response = await post(strategy);

    expect(response.status).toBe(201);
    const { strategy: created } = await response.json();
    expect(created).toMatchObject({ name: '15m BB acceptance', description: null });
    expect(created.rules).toEqual([expect.objectContaining({ text: 'Accepted above the 15m band', kind: 'edge' })]);

    const { strategies } = await (await GET()).json();
    expect(strategies.map((s) => s.id)).toEqual([created.id]);
  });

  it('rejects a strategy without rules', async () => {
    const response = await post({ ...strategy, rules: [] });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('rules');
  });
});
