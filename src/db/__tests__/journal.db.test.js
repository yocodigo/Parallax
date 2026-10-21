import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addJournalEntry, listJournalEntries } from '../journal';
import { trades } from '../schema';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

const plan = {
  mode: 'paper',
  symbol: 'SPY',
  assetClass: 'stock',
  direction: 'long',
  quantity: 10,
  plannedEntry: 100,
  initialStop: 98,
  target: 106,
};

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('addJournalEntry', () => {
  it('saves an entry and returns it with an id', async () => {
    const saved = await addJournalEntry(db, {
      kind: 'review',
      notes: 'Exited early again.',
      mistakes: ['exited_early'],
    });

    expect(saved.id).toBeTruthy();
    expect(saved).toMatchObject({ kind: 'review', mistakes: ['exited_early'] });
  });
});

describe('listJournalEntries', () => {
  it('returns entries newest first', async () => {
    await addJournalEntry(db, { kind: 'review', notes: 'Older', createdAt: new Date('2026-10-01') });
    await addJournalEntry(db, { kind: 'review', notes: 'Newer', createdAt: new Date('2026-10-02') });

    const entries = await listJournalEntries(db);

    expect(entries.map((entry) => entry.notes)).toEqual(['Newer', 'Older']);
  });

  it('attaches the linked trade, or null when there is none', async () => {
    const [trade] = await db.insert(trades).values(plan).returning();
    await addJournalEntry(db, { kind: 'plan', tradeId: trade.id, notes: 'Bull flag on the daily.' });
    await addJournalEntry(db, { kind: 'review', notes: 'No trades today.' });

    const entries = await listJournalEntries(db);

    expect(entries.find((entry) => entry.kind === 'plan').trade).toMatchObject({
      symbol: 'SPY',
      initialStop: 98,
    });
    expect(entries.find((entry) => entry.kind === 'review').trade).toBeNull();
  });

  it('returns at most the requested number of entries', async () => {
    for (const notes of ['One', 'Two', 'Three']) {
      await addJournalEntry(db, { kind: 'review', notes });
    }

    expect(await listJournalEntries(db, { limit: 2 })).toHaveLength(2);
  });
});