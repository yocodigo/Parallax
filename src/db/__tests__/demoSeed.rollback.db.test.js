import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { count } from 'drizzle-orm';
import * as demo from '@/lib/demoSeed';
import { seedDemo } from '../demoSeed';
import { dailyPlans, journalEntries, strategies, trades } from '../schema';
import { createTestDb, resetDb } from '../testing';

// An exit that finds its trade in the wrong state answers null; the seed must
// then roll back everything it had written, not leave half a week behind.
vi.mock('../trades', async (importOriginal) => ({
  ...(await importOriginal()),
  recordExit: vi.fn(async () => null),
}));

const db = createTestDb();

const rows = async (table) => (await db.select({ n: count() }).from(table))[0].n;

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('seedDemo when a step fails', () => {
  it('throws and leaves the database empty', async () => {
    await expect(seedDemo(db, demo)).rejects.toThrow(/could not record the SPY exit/);

    for (const table of [trades, journalEntries, strategies, dailyPlans]) {
      expect(await rows(table)).toBe(0);
    }
  });
});
