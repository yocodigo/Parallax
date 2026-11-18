import { listContextDeltas, listContextLevels } from '@/db/contexts';
import { getDailyPlan } from '@/db/dailyPlans';
import { listStrategies } from '@/db/strategies';
import { listClosedTradesBetween } from '@/db/trades';
import { occSymbol } from '@/lib/context/options';
import { underlyingExcursions } from '@/lib/excursions';
import { heatSummary, isWinner, winnerHeat } from '@/lib/optionHeat';
import { afterExit, afterExitSummary } from '@/lib/setups/afterExit';
import { entryTiming, entryTimingSummary } from '@/lib/setups/entryTiming';
import { reviewExit } from '@/lib/setups/exitReview';
import { nyDay, sessionBars } from '@/lib/setups/session';
import { DETECTED_MAX_BARS, POST_EXIT_MIN } from '@/lib/setups/settings';
import { profitLoss } from '@/lib/tradeMetrics';
import { fetchMinuteBars } from './minuteBars';
import { fetchOptionBars } from './optionBars';

const MINUTE = 60_000;
const minuteOf = (date) => Math.floor(date.getTime() / MINUTE) * MINUTE;

// Heat on winners, after the exit, and entry timing (rules-v3 section 8, items
// 8, 3, and 9) over the closed option trades of `mode` that closed in [from,
// to). Recomputed per call from Alpaca's bars, never stored: the underlying's
// minute bars once per symbol and New York day of the fill (reaching
// POST_EXIT_MIN minutes past that day's last exit or DETECTED_MAX_BARS 5m
// bars past its last fill, whichever is later, and not past `now`), and each
// winner's contract bars from its fill's minute to its exit's. A failed fetch fails the call.
// Entry timing reads each trade's strategy detector and the levels its
// snapshot kept (for the three-gate entry).
// Returns { heat: { rows, summary, summaryAll }, afterExit: { rows, summary },
// timing: { rows, groups, untimed } }, each row naming its trade; `untimed`
// counts the trades it can't time: no bars, or a three-gate strategy whose
// snapshot kept no levels.
export async function gatherOptionExcursions(
  db,
  { mode, from, to, now = new Date(), fetchBars = fetchMinuteBars, fetchContractBars = fetchOptionBars }
) {
  const closed = (await listClosedTradesBetween(db, { from, to, mode, assetClass: 'option' })).filter((t) => t.openedAt);

  // The latest exit (or, with other settings, fill) of each symbol and fill
  // day decides how far its fetch reaches. fetchMinuteBars reaches back 5 days from that end, which is why an
  // end is all it needs: a trade held longer than that (or across a long
  // weekend) loses its fill day's bars and is measured on what remains.
  const ends = new Map();
  for (const trade of closed) {
    const key = `${trade.symbol}|${nyDay(trade.openedAt)}`;
    // Past the exit for after-the-exit, and past the fill for entry timing's
    // early trigger: the DETECTED_MAX_BARS-th 5m bar to close after the fill
    // ends within that many 5m periods of the fill's minute, plus the minute
    // after-the-exit also allows. With today's settings the exit's reach is
    // always the later one; the fill's keeps the trigger covered if either
    // setting changes. By the clock: on a feed with gaps fewer bars exist by
    // then, and a later trigger is missed.
    const reach = Math.max(
      minuteOf(trade.closedAt) + (POST_EXIT_MIN + 1) * MINUTE,
      minuteOf(trade.openedAt) + (DETECTED_MAX_BARS * 5 + 1) * MINUTE
    );
    const end = new Date(Math.min(now.getTime(), reach));
    if (!ends.has(key) || end > ends.get(key)) ends.set(key, end);
  }
  const barsByKey = new Map();
  const barsFor = (trade) => {
    const key = `${trade.symbol}|${nyDay(trade.openedAt)}`;
    if (!barsByKey.has(key)) barsByKey.set(key, fetchBars(trade.symbol, ends.get(key)));
    return barsByKey.get(key);
  };
  const plans = new Map();
  const planFor = (trade) => {
    const day = nyDay(trade.openedAt);
    if (!plans.has(day)) plans.set(day, getDailyPlan(db, day));
    return plans.get(day);
  };
  const ids = closed.map((t) => t.id);
  const [deltas, levels, strategies] = await Promise.all([
    listContextDeltas(db, ids),
    listContextLevels(db, ids),
    listStrategies(db),
  ]);
  const detectors = new Map(strategies.map((strategy) => [strategy.id, strategy.detector]));

  const heatRows = [];
  const afterRows = [];
  const timingRows = [];
  let untimed = 0;
  for (const trade of closed) {
    const bars = await barsFor(trade);
    const name = { tradeId: trade.id, symbol: trade.symbol, contract: occSymbol(trade), openedAt: trade.openedAt };
    // The bars it was open for: from the start of the fill's minute to the exit.
    const open = bars.filter((bar) => Date.parse(bar.t) >= minuteOf(trade.openedAt) && Date.parse(bar.t) <= trade.closedAt.getTime());
    const underlying = underlyingExcursions(trade, open);

    // A three-gate strategy's trigger needs the levels its snapshot kept; any
    // other trade without them is timed without the three-gate entry.
    const detector = detectors.get(trade.strategyId) ?? null;
    const kept = levels.get(trade.id);
    const timing =
      detector === 'three_gate' && kept === null ? null : entryTiming(trade, bars, { detector, levels: kept ?? [] });
    if (timing) timingRows.push({ ...name, ...timing, netPnl: profitLoss(trade), heat: underlying });
    else untimed += 1;

    // As the trade's own exit review takes them: the regular session's bars,
    // and T1 as the day's 50% when it was ahead of the fill.
    const session = sessionBars(bars);
    const t1 = reviewExit(trade, session, await planFor(trade))?.t1 ?? null;
    const after = afterExit(trade, session, t1);
    if (after) afterRows.push({ ...name, ...after });

    // Only a winner's contract bars are fetched.
    if (!isWinner(trade)) continue;
    const optionBars = await fetchContractBars(
      name.contract,
      new Date(minuteOf(trade.openedAt)),
      new Date(minuteOf(trade.closedAt) + MINUTE)
    );
    heatRows.push({ ...name, ...winnerHeat(trade, { optionBars, delta: deltas.get(trade.id), underlying }) });
  }

  return {
    heat: { rows: heatRows, summary: heatSummary(heatRows), summaryAll: heatSummary(heatRows, { includeAll: true }) },
    afterExit: { rows: afterRows, summary: afterExitSummary(afterRows) },
    timing: { rows: timingRows, groups: entryTimingSummary(timingRows), untimed },
  };
}
