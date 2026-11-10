import { getDailyPlan } from '@/db/dailyPlans';
import { getPlanEntry, listEntriesForTrades } from '@/db/journal';
import { listStrategies } from '@/db/strategies';
import {
  listClosedTradesWithMistakes,
  listClosedTradesWithRuleChecks,
  listTradesOpenedOn,
} from '@/db/trades';
import { excursions } from '@/lib/excursions';
import { giveback } from '@/lib/giveback';
import { mistakeLedger } from '@/lib/mistakeLedger';
import { reviewEntry } from '@/lib/setups/entryReview';
import { reviewExit } from '@/lib/setups/exitReview';
import { nyDay, sessionBars, tradingDay } from '@/lib/setups/session';
import { gradeTradeGates } from '@/lib/setups/tradeGates';
import { RECENT_TRADES, adherenceRate, judgeStopAdherence, stopRuleTrigger } from '@/lib/stopAdherence';
import { whatsWorking } from '@/lib/whatsWorking';
import { fetchMinuteBars } from './minuteBars';

// [11] Gathers the facts the coaching pass reads (formatCoachingInput's
// input): the day's trades with their reviews, and the history around them.
// Everything is recomputed on each call from the journal and Alpaca's bars;
// nothing here is stored.

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const newestFirst = (a, b) => b.closedAt - a.closedAt;

// `day` is a New York date ('YYYY-MM-DD'). With a `tradeId`, only that trade is
// coached (a review linked to a trade is about it, not the rest of the day);
// without one, the whole day is. Returns null when no such trade was opened
// that day; otherwise { day, trades, stopAdherence, whatsWorking,
// mistakeLedger, strategies }. The history (the mistake ledger, what's working,
// stop adherence) is of closed trades in the mode of the first trade coached,
// so a paper day isn't coached against live results. `fetchBars(symbol, end)`
// returns the underlying's minute bars, oldest first; it runs once per symbol
// and day. A failed fetch rejects the whole call, history included: a coaching
// pass built on part of the history would read as if it were the whole.
export async function gatherCoachingFacts(db, { day, tradeId = null, fetchBars = fetchMinuteBars, now = new Date() }) {
  const openedThatDay = await listTradesOpenedOn(db, day);
  const dayTrades = tradeId ? openedThatDay.filter((trade) => trade.id === tradeId) : openedThatDay;
  if (dayTrades.length === 0) return null;
  const mode = dayTrades[0].mode;

  const [withMistakes, withChecks, entries, strategies] = await Promise.all([
    listClosedTradesWithMistakes(db, { mode }),
    listClosedTradesWithRuleChecks(db, { mode }),
    listEntriesForTrades(db, dayTrades.map((trade) => trade.id)),
    listStrategies(db),
  ]);
  const checksById = new Map(withChecks.map((trade) => [trade.id, trade.ruleChecks]));

  // Bars are fetched for a trade's fill day and the day after it, which reaches
  // the session's close (the exit review reads bars after the exit), so the
  // later bars of a swing trade aren't covered. Crypto bars come from another
  // Alpaca endpoint, not wired up yet.
  const barsByKey = new Map();
  const barsFor = (trade) => {
    if (trade.assetClass === 'crypto' || !trade.openedAt) return Promise.resolve([]);
    // `symbol` is the underlying for stocks and options (domain rules).
    const key = `${trade.symbol}|${tradingDay({ t: trade.openedAt.toISOString() })}`;
    if (!barsByKey.has(key)) {
      const end = new Date(Math.min(now.getTime(), trade.openedAt.getTime() + DAY_MS));
      barsByKey.set(key, fetchBars(trade.symbol, end).then(sessionBars));
    }
    return barsByKey.get(key);
  };

  const plansByDay = new Map();
  const planFor = (trade) => {
    const date = nyDay(trade.openedAt);
    if (!plansByDay.has(date)) plansByDay.set(date, getDailyPlan(db, date));
    return plansByDay.get(date);
  };

  // A trade's reviews, gates, setup, and stop adherence, replayed from its
  // bars. The bars come back too, for the giveback.
  async function analyze(trade) {
    const bars = await barsFor(trade);
    const [dailyPlan, planEntry] = await Promise.all([planFor(trade), getPlanEntry(db, trade.id)]);
    const exitReview = reviewExit(trade, bars, dailyPlan);
    const entryReview = reviewEntry(trade, bars);
    const mistakes = withMistakes.find((t) => t.id === trade.id)?.mistakes ?? [];
    return {
      bars,
      entryReview,
      exitReview,
      gates: gradeTradeGates(trade, bars, { dailyPlan, planEntry }),
      setups: entryReview?.setup ? [entryReview.setup.name] : [],
      stopAdherence: judgeStopAdherence(trade, mistakes, stopRuleTrigger(trade, bars, exitReview?.t1 ?? null)),
    };
  }

  // What's working reads the most recent closed trades; stop adherence reads
  // the most recent ones that had a stop rule, which can reach further back.
  // The two sets overlap, and each trade is analyzed once.
  const closed = [...withMistakes].sort(newestFirst);
  const recent = closed.slice(0, RECENT_TRADES);
  const judgedPool = closed.filter((trade) => trade.stopRule).slice(0, RECENT_TRADES);
  const analyses = new Map();
  // One at a time, so the fetches don't hit Alpaca's rate limit together.
  for (const trade of new Set([...recent, ...judgedPool])) analyses.set(trade.id, await analyze(trade));

  const tradeFacts = [];
  for (const trade of dayTrades) {
    // A trade still open has no exit review, giveback, or stop judgment, but its entry review stands.
    const analysis = analyses.get(trade.id) ?? (await analyze(trade));
    tradeFacts.push({
      trade,
      entries: entries.filter((entry) => entry.tradeId === trade.id),
      entryReview: analysis.entryReview,
      exitReview: analysis.exitReview,
      giveback: givebackOf(trade, analysis.bars),
      stopAdherence: analysis.stopAdherence,
    });
  }

  return {
    day,
    trades: tradeFacts,
    stopAdherence: adherenceRate(
      judgedPool.map((trade) => ({ closedAt: trade.closedAt, result: analyses.get(trade.id).stopAdherence?.result }))
    ),
    whatsWorking: whatsWorking(
      recent.map((trade) => ({
        ...trade,
        gates: analyses.get(trade.id).gates,
        setups: analyses.get(trade.id).setups,
        ruleChecks: checksById.get(trade.id) ?? [],
      }))
    ),
    mistakeLedger: mistakeLedger(withMistakes),
    strategies: strategies.map(({ name, rules }) => ({ name, rules: rules.map(({ kind, text }) => ({ kind, text })) })),
  };
}

// The giveback of a trade closed in the bars' window, measured on the bars it
// was open for (from the minute holding the fill to the exit). Null when it
// closed past them, as a swing trade does: they reach a day from the fill.
function givebackOf(trade, bars) {
  // Stocks only: an option's prices are premiums, which the underlying's bars
  // can't be measured against.
  if (trade.assetClass !== 'stock' || !trade.closedAt || trade.closedAt.getTime() > trade.openedAt.getTime() + DAY_MS) return null;
  const from = Math.floor(trade.openedAt.getTime() / MINUTE_MS) * MINUTE_MS;
  const open = bars.filter((bar) => {
    const start = Date.parse(bar.t);
    return start >= from && start < trade.closedAt.getTime();
  });
  return giveback(trade, excursions(trade, open));
}
