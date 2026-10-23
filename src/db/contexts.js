import { eq } from 'drizzle-orm';
import { tradeContexts } from './schema';

// Saves the snapshot taken at entry. A trade keeps its first snapshot: a
// later one wouldn't be the context at entry.
export async function saveTradeContext(db, tradeId, context) {
  await db.insert(tradeContexts).values({ tradeId, context }).onConflictDoNothing();
}

export async function getTradeContext(db, tradeId) {
  const [row] = await db.select().from(tradeContexts).where(eq(tradeContexts.tradeId, tradeId));
  return row?.context ?? null;
}
