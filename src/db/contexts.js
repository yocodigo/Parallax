import { and, asc, eq, sql } from 'drizzle-orm';
import { tradeContexts, trades } from './schema';

// Saves the snapshot taken at entry. A trade keeps its first snapshot: a
// later one wouldn't be the context at entry.
export async function saveTradeContext(db, tradeId, context) {
  await db.insert(tradeContexts).values({ tradeId, context }).onConflictDoNothing();
}

export async function getTradeContext(db, tradeId) {
  const [row] = await db.select().from(tradeContexts).where(eq(tradeContexts.tradeId, tradeId));
  return row?.context ?? null;
}

// The trades whose snapshot predates `setups` (version 1), oldest entry
// first, with what working them out needs. `?` is Postgres's jsonb "has this
// key" operator, not a query placeholder.
export async function listContextsWithoutSetups(db) {
  return db
    .select({
      id: trades.id,
      symbol: trades.symbol,
      assetClass: trades.assetClass,
      direction: trades.direction,
      optionType: trades.optionType,
      openedAt: trades.openedAt,
    })
    .from(tradeContexts)
    .innerJoin(trades, eq(trades.id, tradeContexts.tradeId))
    .where(sql`not (${tradeContexts.context} ? 'setups')`)
    .orderBy(asc(trades.openedAt));
}

// Adds `setups` to a version 1 snapshot, which makes it version 2. The rest is
// still as captured at entry: `||` merges the two objects, the right side's
// keys winning. A snapshot that already has setups is left alone, checked in
// the update itself so a capture saved at the same moment is never replaced.
export async function addContextSetups(db, tradeId, setups) {
  await db
    .update(tradeContexts)
    .set({
      context: sql`${tradeContexts.context} || jsonb_build_object('version', 2, 'setups', ${JSON.stringify(setups)}::jsonb)`,
    })
    .where(and(eq(tradeContexts.tradeId, tradeId), sql`not (${tradeContexts.context} ? 'setups')`));
}
