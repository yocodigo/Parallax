import { eq } from 'drizzle-orm';
import { performanceReviews } from './schema';

// The saved Performance Review of a range (see the table), or null if none was written.
export async function getPerformanceReview(db, rangeKey) {
  const [row] = await db.select().from(performanceReviews).where(eq(performanceReviews.rangeKey, rangeKey));
  return row ?? null;
}

// Replaces the range's review: only the latest is kept.
export async function savePerformanceReview(db, { rangeKey, review, tradeCount, rangeFrom, rangeTo }) {
  const values = { rangeKey, review, tradeCount, rangeFrom, rangeTo, reviewedAt: new Date() };
  const [row] = await db
    .insert(performanceReviews)
    .values(values)
    .onConflictDoUpdate({ target: performanceReviews.rangeKey, set: values })
    .returning();
  return row;
}
