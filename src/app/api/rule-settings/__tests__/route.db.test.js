import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { resetDb } from '@/db/testing';
import { DEFAULT_RULE_SETTINGS } from '@/lib/ruleSettings';
import { GET, PUT } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const get = () => GET(new Request('http://localhost/api/rule-settings'));
const put = (body) =>
  PUT(new Request('http://localhost/api/rule-settings', { method: 'PUT', body: JSON.stringify(body) }));

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('/api/rule-settings', () => {
  it('starts with the defaults', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: DEFAULT_RULE_SETTINGS });
  });

  it('saves new rules and reads them back', async () => {
    const settings = { ...DEFAULT_RULE_SETTINGS, windowsOn: false, riskPerTrade: 25 };

    const response = await put(settings);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings });
    expect(await (await get()).json()).toEqual({ settings });
  });

  it('rejects invalid rules with field errors', async () => {
    const response = await put({ ...DEFAULT_RULE_SETTINGS, backstopPct: 2 });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('backstopPct');
  });

  it('rejects a body that is not JSON', async () => {
    const response = await PUT(new Request('http://localhost/api/rule-settings', { method: 'PUT', body: 'nope' }));

    expect(response.status).toBe(400);
  });
});
