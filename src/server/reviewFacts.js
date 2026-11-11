import { listDailyPlansBetween } from '@/db/dailyPlans';
import { listEntriesForTrades, listUnlinkedEntriesBetween } from '@/db/journal';
import { listStrategies } from '@/db/strategies';
import { listClosedTradesBetween, listPlanFacts } from '@/db/trades';
import { buildReviewFacts } from '@/lib/performanceReview';

// Reads what the Performance Review needs for a range (parseReviewRange's
// result) and builds the facts the coach reads (buildReviewFacts): the trades
// closed in it, every mode, with the plan facts the adherence checks use; the
// entries of those trades and the unlinked ones written in it; the days' fib
// plans; and the strategies.
export async function gatherReviewFacts(db, range) {
  const closed = await listClosedTradesBetween(db, { from: range.from ?? undefined, to: range.to ?? undefined });
  const ids = closed.map((trade) => trade.id);
  const planFacts = await listPlanFacts(db, ids);

  const [linked, unlinked, dailyPlans, strategies] = await Promise.all([
    listEntriesForTrades(db, ids),
    listUnlinkedEntriesBetween(db, { from: range.from, to: range.to }),
    listDailyPlansBetween(db, { fromDay: range.fromDay, toDay: range.toDay }),
    listStrategies(db),
  ]);

  return buildReviewFacts({
    trades: closed.map((trade) => ({ ...trade, ...planFacts.get(trade.id) })),
    entries: [...linked, ...unlinked],
    dailyPlans,
    strategies,
    range: { label: range.label, from: range.fromDay, to: range.toDay },
  });
}
