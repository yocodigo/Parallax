import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addJournalEntry, listJournalEntries, savePlan } from '../journal';
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

  it('returns only entries created at or after `since`', async () => {
    await addJournalEntry(db, { kind: 'review', notes: 'Last week', createdAt: new Date('2026-10-14') });
    await addJournalEntry(db, { kind: 'review', notes: 'Monday', createdAt: new Date('2026-10-19') });
    await addJournalEntry(db, { kind: 'review', notes: 'Today', createdAt: new Date('2026-10-22') });

    const entries = await listJournalEntries(db, { since: new Date('2026-10-19') });

    expect(entries.map((entry) => entry.notes)).toEqual(['Today', 'Monday']);
  });
});

describe('savePlan', () => {
  it('saves the trade and a linked plan entry together', async () => {
    const { trade, entry } = await savePlan(db, {
      plan,
      entry: { notes: 'Bull flag on the daily.', emotion: 'calm' },
    });

    expect(trade).toMatchObject({ symbol: 'SPY', plannedEntry: 100, initialStop: 98 });
    expect(entry).toMatchObject({ kind: 'plan', tradeId: trade.id, emotion: 'calm' });
  });

  it('saves nothing if the entry cannot be saved', async () => {
    await expect(savePlan(db, { plan, entry: { notes: null } })).rejects.toThrow();

    expect(await db.select().from(trades)).toHaveLength(0);
  });
});