import { eq } from 'drizzle-orm';
import { dailyPlans } from './schema';

// A plan without its bookkeeping columns. The optional fields come back as
// null rather than missing, so a dropped second fib reads the same as one that
// was never recorded.
const pickPlan = (row) => ({
  tradeDate: row.tradeDate,
  ltfDirection: row.ltfDirection,
  ltfFib50: row.ltfFib50,
  ltfFib100: row.ltfFib100,
  htfDirection: row.htfDirection ?? null,
  htfFib50: row.htfFib50 ?? null,
  htfFib100: row.htfFib100 ?? null,
  notes: row.notes ?? null,
});

// The fibs recorded for a trading day (a 'YYYY-MM-DD' New York date), or null
// if the day was never planned.
export async function getDailyPlan(db, tradeDate) {
  const [row] = await db.select().from(dailyPlans).where(eq(dailyPlans.tradeDate, tradeDate));
  return row ? pickPlan(row) : null;
}

// Replaces the day's plan; there's only ever one per day. Writing the optional
// fields as explicit nulls is what clears a second fib that was dropped when
// the anchors were redrawn.
export async function saveDailyPlan(db, plan) {
  const values = pickPlan(plan);
  const [row] = await db
    .insert(dailyPlans)
    .values(values)
    .onConflictDoUpdate({ target: dailyPlans.tradeDate, set: values })
    .returning();
  return pickPlan(row);
}
