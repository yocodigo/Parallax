// [8] A recorded trade's pre-entry gates, assembled from the underlying's
// minute bars. Pure: the caller fetches the bars (session bars, oldest first,
// Alpaca's keys) and reads the daily plan and the trade's plan entry from the
// database.
//
// Every bar-derived gate is judged from bars that had closed when the fill
// happened (section 1: the entry review only uses bars that closed before the
// entry), so each timeframe is resampled with `asOf` the fill time and the
// newest bar left is the last one that closed before it.

import { bandCross } from './direction';
import { gradeGates } from './gates';
import { tradeBias } from './replayTrades';
import { resample } from './resample';
import { tradingDay } from './session';
import { dealingRange, swings } from './swings';

const MINUTE = 60_000;

// The newest bar of `bars`, as an index, if it belongs to `day`. Resampling
// with `asOf` the fill already drops the period the fill fell inside, so the
// newest bar left is the last one that closed before the entry — unless the
// fill came so early that it was the previous session's.
function lastIndexOfDay(bars, day) {
  const i = bars.length - 1;
  return i >= 0 && tradingDay(bars[i]) === day ? i : null;
}

// The 15m bar that set the bias: the newest close before the entry that
// crossed the middle band (section 3.1's cross). Searched back over the
// fill's own session only, the way findEntry reads a cross — a bias doesn't
// carry into the next morning, so a session with no cross before the fill set
// no bias at all.
function crossIndex(bars15, day) {
  for (let i = bars15.length - 1; i >= 0; i--) {
    if (tradingDay(bars15[i]) !== day) return null;
    if (bandCross(bars15, i)?.crossed) return i;
  }
  return null;
}

// The underlying's price at the entry: the close of the last minute bar that
// ended before the fill. The trade's own entryPrice can't serve here — for an
// option it's the premium, which says nothing about where SPY sat in its
// range, and section 1 runs every detector on the underlying.
function underlyingAt(bars, asOf, day) {
  const time = asOf.getTime();
  for (let i = bars.length - 1; i >= 0; i--) {
    if (Date.parse(bars[i].t) + MINUTE <= time) {
      return tradingDay(bars[i]) === day ? bars[i].c : null;
    }
  }
  return null;
}

// A trade's gates, keyed by name, as gradeGates returns them. `bars` are the
// underlying's minute bars around the entry; `dailyPlan` is the day's plan row
// and `planEntry` the trade's plan journal entry, both null when there is
// none.
export function gradeTradeGates(trade, bars = [], { dailyPlan = null, planEntry = null } = {}) {
  const recorded = {
    assetClass: trade.assetClass,
    openedAt: trade.openedAt,
    quantity: trade.quantity,
    stopRule: trade.stopRule,
    dailyPlan,
    planEntry,
  };
  // A plan that was never entered has no fill to judge the bars against; the
  // gates it recorded are still worth grading.
  if (!trade.openedAt) return gradeGates(recorded);

  const asOf = trade.openedAt;
  const day = tradingDay({ t: asOf.toISOString() });
  const bars15 = resample(bars, 15, { asOf });
  const bars5 = resample(bars, 5, { asOf });
  // The 5m bar the entry is judged on is the last one that closed before the
  // fill, not the setup's ideal entry candle: section 3.1 enters at the close
  // of a 5m candle, and grading the candle findEntry picks would pass by
  // definition, since finding it requires the overlap this gate asks about.
  const i5 = lastIndexOfDay(bars5, day);
  // The dealing range comes from the 5m swings, the timeframe the entry was
  // taken on (section 1). setups.md doesn't say which one mid-range is read
  // from. **(confirm)**
  const range = i5 === null ? null : dealingRange(swings(bars5, i5));

  return gradeGates({
    ...recorded,
    // The side the trade bets on the underlying, so a bought put reads short.
    direction: tradeBias(trade),
    entryPrice: underlyingAt(bars, asOf, day),
    bars15,
    directionBarIndex: crossIndex(bars15, day),
    entryBar: i5 === null ? null : bars5[i5],
    entryPrevBar: i5 === null || i5 < 1 ? null : bars5[i5 - 1],
    dealingRange: range,
  });
}
