import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { journalEntries, trades } from './schema';

// Repository functions take the database as their first argument, so tests
// can pass the test database and the app can pass its own.

export async function addJournalEntry(db, entry) {
  const [saved] = await db.insert(journalEntries).values(entry).returning();
  return saved;
}

// Newest first, with the linked trade (or null) attached for display.
// `since` limits it to entries created at or after that moment.
export async function listJournalEntries(db, { limit = 50, since } = {}) {
  const rows = await db
    .select({ entry: journalEntries, trade: trades })
    .from(journalEntries)
    .leftJoin(trades, eq(journalEntries.tradeId, trades.id))
    .where(since ? gte(journalEntries.createdAt, since) : undefined)
    .orderBy(desc(journalEntries.createdAt))
    .limit(limit);

  return rows.map(({ entry, trade }) => ({ ...entry, trade }));
}

export async function getJournalEntry(db, id) {
  const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
  return entry ?? null;
}

// Every journal entry linked to one of the trades, oldest first.
export async function listEntriesForTrades(db, tradeIds) {
  if (tradeIds.length === 0) return [];
  return db
    .select()
    .from(journalEntries)
    .where(inArray(journalEntries.tradeId, tradeIds))
    .orderBy(asc(journalEntries.createdAt));
}

// The plan journal entry that recorded a trade, for the state gate (section
// 8): that's where the pre-entry emotion and mistakes live. A trade has at
// most one.
export async function getPlanEntry(db, tradeId) {
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.tradeId, tradeId), eq(journalEntries.kind, 'plan')));
  return entry ?? null;
}

// Stores the coaching text on a review entry, replacing any earlier pass (the
// re-run button). Null when the entry doesn't exist or isn't a review.
export async function saveCoaching(db, entryId, coaching) {
  const [saved] = await db
    .update(journalEntries)
    .set({ coaching, coachedAt: new Date() })
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.kind, 'review')))
    .returning();
  return saved ?? null;
}

// A plan is a trade plus the journal entry explaining it. They're saved in one
// transaction, so you never end up with one without the other.
export async function savePlan(db, { plan, entry }) {
  return db.transaction(async (tx) => {
    const [trade] = await tx.insert(trades).values(plan).returning();
    const [savedEntry] = await tx
      .insert(journalEntries)
      .values({ ...entry, kind: 'plan', tradeId: trade.id })
      .returning();

    return { trade, entry: savedEntry };
  });
}

// Deletes an entry. A plan entry holds its trade's entry and exit controls, so
// once the trade has a fill it stays (reason 'filled'); a plan that was never
// filled goes together with its trade, which would otherwise be left with no
// way to show in the journal. Reviews and theses are deleted on their own and
// their linked trade is untouched.
export async function deleteJournalEntry(db, id) {
  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!entry) return { deleted: false, reason: 'not_found' };

    if (entry.kind === 'plan' && entry.tradeId) {
      // Locked so a fill recorded at the same moment is seen, not deleted.
      const [trade] = await tx.select().from(trades).where(eq(trades.id, entry.tradeId)).for('update');
      if (trade?.openedAt) return { deleted: false, reason: 'filled' };
      await tx.delete(journalEntries).where(eq(journalEntries.id, id));
      if (trade) await tx.delete(trades).where(eq(trades.id, trade.id));
      return { deleted: true };
    }

    await tx.delete(journalEntries).where(eq(journalEntries.id, id));
    return { deleted: true };
  });
}
