import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { createStrategy } from '@/db/strategies';
import { resetDb } from '@/db/testing';
import { PUT } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const strategy = {
  name: '15m BB acceptance',
  description: null,
  rules: [{ text: 'Accepted above the 15m band', kind: 'edge' }],
};

const put = (id, body) =>
  PUT(new Request(`http://localhost/api/strategies/${id}`, { method: 'PUT', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('PUT /api/strategies/[id]', () => {
  it('replaces the strategy, editing rules sent with their id', async () => {
    const created = await createStrategy(getDb(), strategy);
    const [rule] = created.rules;

    const response = await put(created.id, {
      name: 'BB acceptance',
      rules: [
        { id: rule.id, text: 'Accepted outside the 15m band', kind: 'edge' },
        { text: 'Risk within my per-trade limit', kind: 'discipline' },
      ],
    });

    expect(response.status).toBe(200);
    const { strategy: updated } = await response.json();
    expect(updated.name).toBe('BB acceptance');
    expect(updated.rules.map((r) => r.text)).toEqual(['Accepted outside the 15m band', 'Risk within my per-trade limit']);
    expect(updated.rules[0].id).toBe(rule.id);
  });

  it('rejects an invalid strategy', async () => {
    const created = await createStrategy(getDb(), strategy);

    expect((await put(created.id, { ...strategy, name: '' })).status).toBe(400);
  });

  it('answers 404 for a strategy that does not exist, or an id that is not one', async () => {
    expect((await put('00000000-0000-4000-8000-000000000000', strategy)).status).toBe(404);
    expect((await put('nope', strategy)).status).toBe(404);
  });
});
