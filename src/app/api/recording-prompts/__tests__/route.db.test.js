import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { resetDb } from '@/db/testing';
import { DEFAULT_RECORDING_PROMPTS } from '@/lib/recordingPrompts';
import { GET, PUT } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const prompts = {
  preTradePrompt: 'Direction, setup, stop, target.',
  endOfDayPrompt: 'How did it go?',
  micTips: 'Quiet room.',
};

const get = () => GET(new Request('http://localhost/api/recording-prompts'));
const put = (body) =>
  PUT(new Request('http://localhost/api/recording-prompts', { method: 'PUT', body: JSON.stringify(body) }));

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('/api/recording-prompts', () => {
  it('starts with the defaults from setups.md 9.6', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(DEFAULT_RECORDING_PROMPTS);
  });

  it('saves new prompts and reads them back', async () => {
    const response = await put(prompts);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(prompts);
    expect(await (await get()).json()).toEqual(prompts);
  });

  it('rejects a blank prompt', async () => {
    const response = await put({ ...prompts, micTips: '  ' });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('micTips');
  });
});
