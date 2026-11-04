import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { nyDay } from '@/lib/setups/session';
import { journalEntries, tradeRuleChecks, trades } from './schema';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getTrade(db, id) {
  const [trade] = await db.select().from(trades).where(eq(trades.id, id));
  return trade ?? null;
}

// Each update matches only a trade in the right state, so two submits can't
// both record a fill. They return null when the trade wasn't in that state.

// Planned -> open. `overriddenBreakers` lists circuit breakers that were
// tripped when the entry was recorded anyway; `ruleChecks` are the strategy
// checklist as answered ({ ruleId, ruleText, met }), saved with the entry.
export async function recordEntry(db, id, { entryPrice, openedAt, overriddenBreakers = [], ruleChecks = [] }) {
  return db.transaction(async (tx) => {
    const [trade] = await tx
      .update(trades)
      .set({ entryPrice, openedAt, overriddenBreakers })
      .where(and(eq(trades.id, id), isNull(trades.openedAt)))
      .returning();
    if (!trade) return null;

    if (ruleChecks.length > 0) {
      await tx.insert(tradeRuleChecks).values(ruleChecks.map((check) => ({ ...check, tradeId: id })));
    }
    return trade;
  });
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

// One symbol's closed trades, oldest entry first. `mode` limits it to live,
// paper, or backtest trades.
export async function listClosedTrades(db, { symbol, mode } = {}) {
  return db
    .select()
    .from(trades)
    .where(and(isNotNull(trades.closedAt), eq(trades.symbol, symbol), mode ? eq(trades.mode, mode) : undefined))
    .orderBy(trades.openedAt);
}

// Closed trades that closed in [from, to), oldest exit first. `mode` and
// `assetClass` limit it to one mode or asset class when given.
export async function listClosedTradesBetween(db, { from, to, mode, assetClass }) {
  return db
    .select()
    .from(trades)
    .where(
      and(
        isNotNull(trades.closedAt),
        gte(trades.closedAt, from),
        lt(trades.closedAt, to),
        mode ? eq(trades.mode, mode) : undefined,
        assetClass ? eq(trades.assetClass, assetClass) : undefined
      )
    )
    .orderBy(trades.closedAt);
}

// Every closed trade of any mode, oldest exit first. `assetClass` limits it to
// one asset class when given.
export async function listAllClosedTrades(db, { assetClass } = {}) {
  return db
    .select()
    .from(trades)
    .where(and(isNotNull(trades.closedAt), assetClass ? eq(trades.assetClass, assetClass) : undefined))
    .orderBy(trades.closedAt);
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

// Closed trades entered through a strategy checklist, oldest exit first, each
// with `ruleChecks` ({ ruleId, ruleText, met }). `mode` limits it to live,
// paper, or backtest trades.
export async function listClosedTradesWithRuleChecks(db, { mode } = {}) {
  const rows = await db
    .select({
      trade: trades,
      check: { ruleId: tradeRuleChecks.ruleId, ruleText: tradeRuleChecks.ruleText, met: tradeRuleChecks.met },
    })
    .from(trades)
    .innerJoin(tradeRuleChecks, eq(tradeRuleChecks.tradeId, trades.id))
    .where(and(isNotNull(trades.closedAt), mode ? eq(trades.mode, mode) : undefined))
    .orderBy(trades.closedAt, trades.id);

  const byId = new Map();
  for (const { trade, check } of rows) {
    if (!byId.has(trade.id)) byId.set(trade.id, { ...trade, ruleChecks: [] });
    byId.get(trade.id).ruleChecks.push(check);
  }
  return [...byId.values()];
}

// The trades entered on a New York day ('YYYY-MM-DD'), in the order opened.
export async function listTradesOpenedOn(db, day) {
  // A New York day sits inside this UTC range whatever the offset; the exact
  // day is then picked out in New York time.
  const start = new Date(`${day}T00:00:00Z`);
  const rows = await db
    .select()
    .from(trades)
    .where(
      and(
        gte(trades.openedAt, new Date(start.getTime() - DAY_MS)),
        lt(trades.openedAt, new Date(start.getTime() + 2 * DAY_MS))
      )
    )
    .orderBy(trades.openedAt);
  return rows.filter((trade) => nyDay(trade.openedAt) === day);
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
