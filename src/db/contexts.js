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

// The trades whose snapshot predates `levels` (versions 1 and 2), oldest
// entry first, with what working them out needs. `?` is Postgres's jsonb "has
// this key" operator, not a query placeholder.
export async function listContextsWithoutLevels(db) {
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
    .where(sql`not (${tradeContexts.context} ? 'levels')`)
    .orderBy(asc(trades.openedAt));
}

// Sets `setups` and `levels` on a snapshot from before version 3, which makes
// it version 3; version 2's setups are replaced, since version 3 adds the
// detected ones. The rest is still as captured at entry: `||` merges the two
// objects, the right side's keys winning. A snapshot that already has levels
// is left alone, checked in the update itself so a capture saved at the same
// moment is never replaced.
export async function addContextSetupsAndLevels(db, tradeId, { setups, levels }) {
  await db
    .update(tradeContexts)
    .set({
      context: sql`${tradeContexts.context} || jsonb_build_object('version', 3, 'setups', ${JSON.stringify(setups)}::jsonb, 'levels', ${JSON.stringify(levels)}::jsonb)`,
    })
    .where(and(eq(tradeContexts.tradeId, tradeId), sql`not (${tradeContexts.context} ? 'levels')`));
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
    // fourTouch.grade is fourTouchGrade's { grade, compression, spacing }; the inner grade is the letter.
    // A trap or weak break is graded too: the grade is the line's quality, not how the trade went.
    grades.set(tradeId, context.setups.fourTouch?.grade?.grade ?? 'none');
  }
  return grades;
}

// The setups each of these trades' snapshots detected at entry (rules-v3 6),
// as a Map by trade id: detectSetups's list, empty when nothing was found.
// null when it can't say: no snapshot, one from before version 3, or one
// taken without the minute bars. Window OK reads it.
export async function listContextDetected(db, tradeIds) {
  const detected = new Map(tradeIds.map((id) => [id, null]));
  if (tradeIds.length === 0) return detected;
  const rows = await db
    .select({ tradeId: tradeContexts.tradeId, context: tradeContexts.context })
    .from(tradeContexts)
    .where(inArray(tradeContexts.tradeId, tradeIds));
  for (const { tradeId, context } of rows) detected.set(tradeId, context?.setups?.detected ?? null);
  return detected;
}

// The level map each of these trades' snapshots kept at the fill (version 3),
// as a Map by trade id: the three-gate entry reads it when setups are
// detected again at review time. null when none was kept (no snapshot, one
// from before version 3, or one taken without the minute bars), which is not
// the same as a map with no levels.
export async function listContextLevels(db, tradeIds) {
  const levels = new Map(tradeIds.map((id) => [id, null]));
  if (tradeIds.length === 0) return levels;
  const rows = await db
    .select({ tradeId: tradeContexts.tradeId, context: tradeContexts.context })
    .from(tradeContexts)
    .where(inArray(tradeContexts.tradeId, tradeIds));
  for (const { tradeId, context } of rows) levels.set(tradeId, Array.isArray(context?.levels) ? context.levels : null);
  return levels;
}

// The option delta each of these trades' snapshots kept, as a Map by trade id,
// null when there is none: no snapshot, not an option, or captured more than 15
// minutes after the fill, when the live values aren't kept (buildContext).
export async function listContextDeltas(db, tradeIds) {
  const deltas = new Map(tradeIds.map((id) => [id, null]));
  if (tradeIds.length === 0) return deltas;
  const rows = await db
    .select({ tradeId: tradeContexts.tradeId, context: tradeContexts.context })
    .from(tradeContexts)
    .where(inArray(tradeContexts.tradeId, tradeIds));
  for (const { tradeId, context } of rows) deltas.set(tradeId, context?.option?.delta ?? null);
  return deltas;
}
