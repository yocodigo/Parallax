import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { addJournalEntry, getJournalEntry, savePlan } from '@/db/journal';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { DELETE } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const plan = {
  mode: 'paper',
  symbol: 'SPY',
  assetClass: 'stock',
  direction: 'long',
  quantity: 10,
  plannedEntry: 100,
  initialStop: 98,
};

const call = (id) =>
  DELETE(new Request(`http://localhost/api/journal/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => resetDb(getDb()));
afterAll(() => getDb().$client.end());

describe('DELETE /api/journal/[id]', () => {
  it('deletes a review and answers 200', async () => {
    const review = await addJournalEntry(getDb(), { kind: 'review', notes: 'Review.' });

    const response = await call(review.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(await getJournalEntry(getDb(), review.id)).toBeNull();
  });

  it('deletes a plan that was never filled, with its trade', async () => {
    const { trade, entry } = await savePlan(getDb(), { plan, entry: { notes: 'Plan.' } });

    const response = await call(entry.id);

    expect(response.status).toBe(200);
    expect(await getDb().select().from(trades).where(eq(trades.id, trade.id))).toHaveLength(0);
  });

  it('answers 409 and keeps a plan whose trade was filled', async () => {
    const { trade, entry } = await savePlan(getDb(), { plan, entry: { notes: 'Plan.' } });
    await getDb().update(trades).set({ openedAt: new Date(), entryPrice: 100 }).where(eq(trades.id, trade.id));

    const response = await call(entry.id);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/filled/i);
    expect(await getJournalEntry(getDb(), entry.id)).not.toBeNull();
  });

  it('answers 404 for an unknown or malformed id', async () => {
    expect((await call('00000000-0000-0000-0000-000000000000')).status).toBe(404);
    expect((await call('not-a-uuid')).status).toBe(404);
  });
});
