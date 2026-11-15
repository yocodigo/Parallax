import { listContextDeltas } from '@/db/contexts';
import { getDailyPlan } from '@/db/dailyPlans';
import { listClosedTradesBetween } from '@/db/trades';
import { occSymbol } from '@/lib/context/options';
import { underlyingExcursions } from '@/lib/excursions';
import { heatSummary, isWinner, winnerHeat } from '@/lib/optionHeat';
import { afterExit, afterExitSummary } from '@/lib/setups/afterExit';
import { reviewExit } from '@/lib/setups/exitReview';
import { nyDay, sessionBars } from '@/lib/setups/session';
import { POST_EXIT_MIN } from '@/lib/setups/settings';
import { fetchMinuteBars } from './minuteBars';
import { fetchOptionBars } from './optionBars';

const MINUTE = 60_000;
const minuteOf = (date) => Math.floor(date.getTime() / MINUTE) * MINUTE;

// Heat on winners and after the exit (rules-v3 section 8, items 8 and 3) over
// the closed option trades of `mode` that closed in [from, to). Recomputed per
// call from Alpaca's bars, never stored: the underlying's minute bars once per
// symbol and New York day of the fill (reaching POST_EXIT_MIN minutes past
// that day's last exit, and not past `now`), and each winner's contract bars
// from its fill's minute to its exit's. A failed fetch fails the call.
// Returns { heat: { rows, summary, summaryAll }, afterExit: { rows, summary } },
// each row naming its trade.
export async function gatherOptionExcursions(
  db,
  { mode, from, to, now = new Date(), fetchBars = fetchMinuteBars, fetchContractBars = fetchOptionBars }
) {
  const closed = (await listClosedTradesBetween(db, { from, to, mode, assetClass: 'option' })).filter((t) => t.openedAt);

  // The latest exit of each symbol and fill day decides how far its fetch reaches.
  const ends = new Map();
  for (const trade of closed) {
    const key = `${trade.symbol}|${nyDay(trade.openedAt)}`;
    const end = new Date(Math.min(now.getTime(), minuteOf(trade.closedAt) + (POST_EXIT_MIN + 1) * MINUTE));
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
  const deltas = await listContextDeltas(
    db,
    closed.map((t) => t.id)
  );

  const heatRows = [];
  const afterRows = [];
  for (const trade of closed) {
    const bars = await barsFor(trade);
    const name = { tradeId: trade.id, symbol: trade.symbol, contract: occSymbol(trade), openedAt: trade.openedAt };
    // The bars it was open for: from the start of the fill's minute to the exit.
    const open = bars.filter((bar) => Date.parse(bar.t) >= minuteOf(trade.openedAt) && Date.parse(bar.t) <= trade.closedAt.getTime());
    const underlying = underlyingExcursions(trade, open);

    // T1 as the exit review takes it: the day's 50%, when it was ahead of the fill.
    const t1 = reviewExit(trade, sessionBars(bars), await planFor(trade))?.t1 ?? null;
    const after = afterExit(trade, bars, t1);
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
  };
}
