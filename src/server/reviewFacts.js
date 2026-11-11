import { listDailyPlansBetween } from '@/db/dailyPlans';
import { listEntriesForTrades, listUnlinkedEntriesBetween } from '@/db/journal';
import { listStrategies } from '@/db/strategies';
import { listClosedTradesBetween, listPlanFacts } from '@/db/trades';
import { buildReviewFacts } from '@/lib/performanceReview';
import { nyDay } from '@/lib/setups/session';

// Reads what the Performance Review needs for a range (parseReviewRange's
// result) and builds the facts the coach reads (buildReviewFacts): the trades
// closed in it, every mode, with the plan facts the adherence checks use; the
// entries of those trades (whenever they were written) and the unlinked ones
// written in the range; the fib plans of the days those trades were opened (a
// swing trade opened before the range keeps its plan) and of the range; and the
// strategies.
export async function gatherReviewFacts(db, range) {
  const closed = await listClosedTradesBetween(db, { from: range.from, to: range.to });
  const ids = closed.map((trade) => trade.id);
  const planFacts = await listPlanFacts(db, ids);

  // Plans from the earliest opening day, if that is before the range starts.
  const openedDays = closed.filter((trade) => trade.openedAt).map((trade) => nyDay(trade.openedAt)).sort();
  const planFrom = range.fromDay && openedDays[0] && openedDays[0] < range.fromDay ? openedDays[0] : range.fromDay;

  const [linked, unlinked, dailyPlans, strategies] = await Promise.all([
    listEntriesForTrades(db, ids),
    listUnlinkedEntriesBetween(db, { from: range.from, to: range.to }),
    listDailyPlansBetween(db, { fromDay: planFrom, toDay: range.toDay }),
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
