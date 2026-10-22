import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { trades } from './schema';

export async function getTrade(db, id) {
  const [trade] = await db.select().from(trades).where(eq(trades.id, id));
  return trade ?? null;
}

// Each update matches only a trade in the right state, so two submits can't
// both record a fill. They return null when the trade wasn't in that state.

// Planned -> open.
export async function recordEntry(db, id, { entryPrice, openedAt }) {
  const [trade] = await db
    .update(trades)
    .set({ entryPrice, openedAt })
    .where(and(eq(trades.id, id), isNull(trades.openedAt)))
    .returning();
  return trade ?? null;
}

// Open -> closed.
export async function recordExit(db, id, { exitPrice, closedAt, exitReason, exitedPerPlan, fees }) {
  const [trade] = await db
    .update(trades)
    .set({ exitPrice, closedAt, exitReason, exitedPerPlan, fees })
    .where(and(eq(trades.id, id), isNotNull(trades.openedAt), isNull(trades.closedAt)))
    .returning();
  return trade ?? null;
}
