import { and, asc, eq, inArray, sql } from 'drizzle-orm';
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

// The four-touch grade each of these trades went with at entry, as a Map by
// trade id: 'A' or 'B', or 'none' when the snapshot had the minute bars but
// found no line. null when it can't say: no snapshot, a version 1 snapshot not
// yet backfilled, or one taken without the bars (`setups` null).
export async function listContextGrades(db, tradeIds) {
  const grades = new Map(tradeIds.map((id) => [id, null]));
  if (tradeIds.length === 0) return grades;
  const rows = await db
    .select({ tradeId: tradeContexts.tradeId, context: tradeContexts.context })
    .from(tradeContexts)
    .where(inArray(tradeContexts.tradeId, tradeIds));
  for (const { tradeId, context } of rows) {
    if (!context?.setups) continue;
    grades.set(tradeId, context.setups.fourTouch?.grade?.grade ?? 'none');
  }
  return grades;
}
