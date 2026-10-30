import { and, asc, count, eq } from 'drizzle-orm';
import { MAX_SCREENSHOTS_PER_TRADE } from '@/lib/screenshot';
import { trades, tradeScreenshots } from './schema';

// Everything but the bytes, which only the image route reads.
const summary = {
  id: tradeScreenshots.id,
  label: tradeScreenshots.label,
  contentType: tradeScreenshots.contentType,
  createdAt: tradeScreenshots.createdAt,
};

export async function listTradeScreenshots(db, tradeId) {
  return db
    .select(summary)
    .from(tradeScreenshots)
    .where(eq(tradeScreenshots.tradeId, tradeId))
    .orderBy(asc(tradeScreenshots.createdAt), asc(tradeScreenshots.id));
}

// Returns { screenshot }, or { error: 'not_found' | 'limit' }. The trade row is
// locked while counting, so two uploads at once can't both take the last slot.
export async function addTradeScreenshot(db, tradeId, { label, contentType, bytes }) {
  return db.transaction(async (tx) => {
    const [trade] = await tx.select({ id: trades.id }).from(trades).where(eq(trades.id, tradeId)).for('update');
    if (!trade) return { error: 'not_found' };

    const [{ n }] = await tx
      .select({ n: count() })
      .from(tradeScreenshots)
      .where(eq(tradeScreenshots.tradeId, tradeId));
    if (n >= MAX_SCREENSHOTS_PER_TRADE) return { error: 'limit' };

    const [screenshot] = await tx
      .insert(tradeScreenshots)
      .values({ tradeId, label, contentType, bytes })
      .returning(summary);
    return { screenshot };
  });
}

// { contentType, bytes } (a Buffer), or null. Looked up under its trade, so a
// screenshot id alone never reaches another trade's image.
export async function getTradeScreenshot(db, tradeId, id) {
  const [row] = await db
    .select({ contentType: tradeScreenshots.contentType, bytes: tradeScreenshots.bytes })
    .from(tradeScreenshots)
    .where(and(eq(tradeScreenshots.id, id), eq(tradeScreenshots.tradeId, tradeId)));
  return row ?? null;
}

export async function deleteTradeScreenshot(db, tradeId, id) {
  const deleted = await db
    .delete(tradeScreenshots)
    .where(and(eq(tradeScreenshots.id, id), eq(tradeScreenshots.tradeId, tradeId)))
    .returning({ id: tradeScreenshots.id });
  return deleted.length > 0;
}
