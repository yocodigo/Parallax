import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addJournalEntry,
  deleteJournalEntry,
  getJournalEntry,
  getPlanEntry,
  listJournalEntries,
  listUnlinkedEntriesBetween,
  saveCoaching,
  savePlan,
} from '../journal';
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

  it('saves an entry with no trade as live unless it names a mode', async () => {
    const plain = await addJournalEntry(db, { kind: 'review', notes: 'Choppy week.' });
    const paper = await addJournalEntry(db, { kind: 'review', notes: 'Paper week.', mode: 'paper' });

    expect(plain.mode).toBe('live');
    expect(paper.mode).toBe('paper');
  });

  it("gives an entry linked to a trade the trade's mode, whatever it was sent with", async () => {
    const { trade } = await savePlan(db, { plan, entry: { notes: 'Plan.' } });

    const review = await addJournalEntry(db, { kind: 'review', notes: 'Review.', tradeId: trade.id, mode: 'live' });

    expect(review.mode).toBe('paper');
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

describe('getPlanEntry', () => {
  it("returns a trade's plan entry", async () => {
    const [trade] = await db.insert(trades).values(plan).returning();
    await addJournalEntry(db, { kind: 'plan', tradeId: trade.id, notes: 'Bull flag on the daily.', emotion: 'calm' });
    await addJournalEntry(db, { kind: 'review', tradeId: trade.id, notes: 'Held too long.' });

    expect(await getPlanEntry(db, trade.id)).toMatchObject({ kind: 'plan', emotion: 'calm' });
  });

  it('returns null when the trade has no plan entry', async () => {
    const [trade] = await db.insert(trades).values(plan).returning();

    expect(await getPlanEntry(db, trade.id)).toBeNull();
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

  it("gives the plan entry the trade's mode", async () => {
    const { entry } = await savePlan(db, { plan, entry: { notes: 'Plan.', mode: 'live' } });

    expect(entry.mode).toBe('paper');
  });

  it('saves nothing if the entry cannot be saved', async () => {
    await expect(savePlan(db, { plan, entry: { notes: null } })).rejects.toThrow();

    expect(await db.select().from(trades)).toHaveLength(0);
  });
});
describe('saveCoaching', () => {
  it('stores the coaching text on a review entry and replaces it on a re-run', async () => {
    const review = await addJournalEntry(db, { kind: 'review', notes: 'Day done.' });
    expect(review.coaching).toBeNull();

    const first = await saveCoaching(db, review.id, 'First pass.');
    expect(first.coaching).toBe('First pass.');
    expect(first.coachedAt).toBeInstanceOf(Date);

    const second = await saveCoaching(db, review.id, 'Second pass.');
    expect(second.coaching).toBe('Second pass.');
  });

  it('returns null for an unknown entry and leaves non-review entries alone', async () => {
    expect(await saveCoaching(db, '00000000-0000-0000-0000-000000000000', 'x')).toBeNull();

    const plan = await addJournalEntry(db, { kind: 'plan', notes: 'A plan.' });
    expect(await saveCoaching(db, plan.id, 'x')).toBeNull();
  });
});

describe('deleteJournalEntry', () => {
  it('deletes a review or thesis and leaves its linked trade alone', async () => {
    const { trade } = await savePlan(db, { plan, entry: { notes: 'Plan.' } });
    const review = await addJournalEntry(db, { kind: 'review', notes: 'Review.', tradeId: trade.id });

    expect(await deleteJournalEntry(db, review.id)).toEqual({ deleted: true });
    expect(await getJournalEntry(db, review.id)).toBeNull();
    expect(await db.select().from(trades)).toHaveLength(1);
  });

  it('deletes a plan that was never filled, along with its trade', async () => {
    const { trade, entry } = await savePlan(db, { plan, entry: { notes: 'Plan.' } });

    expect(await deleteJournalEntry(db, entry.id)).toEqual({ deleted: true });
    expect(await getJournalEntry(db, entry.id)).toBeNull();
    expect(await db.select().from(trades).where(eq(trades.id, trade.id))).toHaveLength(0);
  });

  it('refuses a plan whose trade has been filled', async () => {
    const { trade, entry } = await savePlan(db, { plan, entry: { notes: 'Plan.' } });
    await db.update(trades).set({ openedAt: new Date(), entryPrice: 100 }).where(eq(trades.id, trade.id));

    expect(await deleteJournalEntry(db, entry.id)).toEqual({ deleted: false, reason: 'filled' });
    expect(await getJournalEntry(db, entry.id)).not.toBeNull();
    expect(await db.select().from(trades)).toHaveLength(1);
  });

  it('does not delete a trade that gets filled while the delete is running', async () => {
    const { trade, entry } = await savePlan(db, { plan, entry: { notes: 'Plan.' } });

    let release;
    const held = new Promise((resolve) => (release = resolve));
    let filling;
    const filled = new Promise((resolve) => (filling = resolve));

    // A fill that is written but not yet committed when the delete starts.
    const fill = db.transaction(async (tx) => {
      await tx.update(trades).set({ openedAt: new Date(), entryPrice: 100 }).where(eq(trades.id, trade.id));
      filling();
      await held;
    });
    await filled;

    const deletion = deleteJournalEntry(db, entry.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    await fill;

    expect(await deletion).toEqual({ deleted: false, reason: 'filled' });
    expect(await db.select().from(trades).where(eq(trades.id, trade.id))).toHaveLength(1);
  });

  it('reports an unknown entry', async () => {
    expect(await deleteJournalEntry(db, '00000000-0000-0000-0000-000000000000')).toEqual({
      deleted: false,
      reason: 'not_found',
    });
  });
});

describe('listUnlinkedEntriesBetween', () => {
  const at = (createdAt, overrides) => addJournalEntry(db, { kind: 'thesis', symbol: 'SPY', notes: 'A thesis.', createdAt, ...overrides });

  it('lists the entries with no trade created in [from, to), oldest first', async () => {
    await at(new Date('2026-04-10T12:00:00Z'));
    const inside = await at(new Date('2026-04-12T12:00:00Z'));
    const earlier = await at(new Date('2026-04-11T12:00:00Z'));
    await at(new Date('2026-04-14T12:00:00Z'));

    const entries = await listUnlinkedEntriesBetween(db, {
      from: new Date('2026-04-11T00:00:00Z'),
      to: new Date('2026-04-14T00:00:00Z'),
    });

    expect(entries.map((entry) => entry.id)).toEqual([earlier.id, inside.id]);
  });

  it('leaves out an entry linked to a trade, and leaves a side open when it is null', async () => {
    const [trade] = await db
      .insert(trades)
      .values({ mode: 'live', symbol: 'SPY', assetClass: 'stock', direction: 'long', quantity: 1 })
      .returning();
    await addJournalEntry(db, { kind: 'review', tradeId: trade.id, notes: 'Linked.' });
    const loose = await at(new Date('2026-04-12T12:00:00Z'), { kind: 'review', symbol: null });

    expect((await listUnlinkedEntriesBetween(db, { from: null, to: null })).map((entry) => entry.id)).toEqual([loose.id]);
  });
});
