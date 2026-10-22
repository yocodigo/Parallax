import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { journalEntries, trades } from './schema';

export async function getTrade(db, id) {
  const [trade] = await db.select().from(trades).where(eq(trades.id, id));
  return trade ?? null;
}

// Each update matches only a trade in the right state, so two submits can't
// both record a fill. They return null when the trade wasn't in that state.

// Planned -> open. `overriddenBreakers` lists circuit breakers that were
// tripped when the entry was recorded anyway.
export async function recordEntry(db, id, { entryPrice, openedAt, overriddenBreakers = [] }) {
  const [trade] = await db
    .update(trades)
    .set({ entryPrice, openedAt, overriddenBreakers })
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

// Closed trades, each once, with `mistakes`: every tag from the journal
// entries about it (repeats included; the ledger counts each mistake once per
// trade). `mode` limits it to live, paper, or backtest trades.
export async function listClosedTradesWithMistakes(db, { mode } = {}) {
  const rows = await db
    .select({ trade: trades, mistakes: journalEntries.mistakes })
    .from(trades)
    .leftJoin(journalEntries, eq(journalEntries.tradeId, trades.id))
    .where(and(isNotNull(trades.closedAt), mode ? eq(trades.mode, mode) : undefined))
    .orderBy(trades.closedAt);

  const byId = new Map();
  for (const { trade, mistakes } of rows) {
    if (!byId.has(trade.id)) byId.set(trade.id, { ...trade, mistakes: [] });
    // A trade with no journal entries comes back once, with null mistakes.
    if (mistakes) byId.get(trade.id).mistakes.push(...mistakes);
  }
  return [...byId.values()];
}

// Trades that have been entered, in the given modes, most recent activity
// (exit, or entry while still open) first. Circuit breakers look at these.
export async function listRecentTrades(db, { modes, limit = 100 }) {
  return db
    .select()
    .from(trades)
    .where(and(isNotNull(trades.openedAt), inArray(trades.mode, modes)))
    .orderBy(desc(sql`coalesce(${trades.closedAt}, ${trades.openedAt})`))
    .limit(limit);
}
