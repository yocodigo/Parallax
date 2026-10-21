import { desc, eq } from 'drizzle-orm';
import { journalEntries, trades } from './schema';

// Repository functions take the database as their first argument, so tests
// can pass the test database and the app can pass its own.

export async function addJournalEntry(db, entry) {
  const [saved] = await db.insert(journalEntries).values(entry).returning();
  return saved;
}

// Newest first, with the linked trade (or null) attached for display.
export async function listJournalEntries(db, { limit = 50 } = {}) {
  const rows = await db
    .select({ entry: journalEntries, trade: trades })
    .from(journalEntries)
    .leftJoin(trades, eq(journalEntries.tradeId, trades.id))
    .orderBy(desc(journalEntries.createdAt))
    .limit(limit);

  return rows.map(({ entry, trade }) => ({ ...entry, trade }));
}