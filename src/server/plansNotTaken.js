import { getDailyPlan } from '@/db/dailyPlans';
import { getRuleSettings } from '@/db/settings';
import { listClosedTradesBetween, listUnfilledOptionPlans } from '@/db/trades';
import { occSymbol } from '@/lib/context/options';
import { median } from '@/lib/optionExecution';
import { plansNotTakenSummary, replayPlan } from '@/lib/planReplay';
import { nyDay } from '@/lib/setups/session';
import { fetchMinuteBars } from './minuteBars';
import { fetchOptionBars } from './optionBars';

const HOUR = 60 * 60 * 1000;

// Plans not taken (rules-v3 8.11): the option plans of `mode` written in [from, to) that were
// never filled, each replayed (replayPlan) on its New York day from the time it was written,
// with the saved rule settings and the day's working fib for the symbol. Fees are the median
// of the option trades taken in the same range, an estimate (0 with none taken). Today's
// plans are left out, their day not being over. Recomputed per call from Alpaca's bars, never
// stored: the underlying's minute bars once per symbol and day, and each contract's own. A
// failed fetch fails the call.
// Returns { rows, plans, neverTriggered, replayed, summary, exits, fullCoverage, fees, feesTrades }.
export async function gatherPlansNotTaken(
  db,
  { mode, from, to, now = new Date(), fetchBars = fetchMinuteBars, fetchContractBars = fetchOptionBars }
) {
  const range = { from: from ?? new Date(0), to: to ?? new Date('2100-01-01T00:00:00Z') };
  const today = nyDay(now);
  const unfilled = (await listUnfilledOptionPlans(db, { mode, ...range })).filter((trade) => nyDay(trade.planWrittenAt) < today);
  const taken = (await listClosedTradesBetween(db, { ...range, mode, assetClass: 'option' })).filter((trade) => trade.openedAt);
  const fees = median(taken.map((trade) => trade.fees ?? 0)) ?? 0;
  const rules = await getRuleSettings(db);

  const underlyingByDay = new Map();
  const underlyingFor = (symbol, day, end) => {
    const key = `${symbol}|${day}`;
    if (!underlyingByDay.has(key)) underlyingByDay.set(key, fetchBars(symbol, end));
    return underlyingByDay.get(key);
  };

  const rows = await Promise.all(
    unfilled.map(async (trade) => {
      const day = nyDay(trade.planWrittenAt);
      // 05:00 UTC the next day is after the close in either time zone offset.
      const end = new Date(Math.min(now.getTime(), Date.parse(`${day}T00:00:00Z`) + 29 * HOUR));
      const [underlyingBars, contractBars, dailyPlan] = await Promise.all([
        underlyingFor(trade.symbol, day, end),
        fetchContractBars(occSymbol(trade), trade.planWrittenAt, end),
        getDailyPlan(db, day, trade.symbol),
      ]);
      const replay = replayPlan({
        plan: {
          optionType: trade.optionType,
          plannedEntry: trade.plannedEntry ?? null,
          underlyingStop: trade.underlyingStop ?? null,
          writtenAt: trade.planWrittenAt,
        },
        contractBars,
        underlyingBars,
        rules,
        fib50: dailyPlan?.ltfFib50 ?? null,
      });
      return { tradeId: trade.id, symbol: trade.symbol, day, quantity: trade.quantity, multiplier: trade.multiplier, ...replay };
    })
  );

  return { rows, ...plansNotTakenSummary(rows, { fees }), fees, feesTrades: taken.length };
}
