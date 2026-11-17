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
import { levelMap } from './levels';
import { levelLocation } from './location';
import { tradeBias } from './replayTrades';
import { resample } from './resample';
import { levelRoom } from './room';
import { sessionOf, tradingDay } from './session';

const MINUTE = 60_000;

// The 15m bar that set the bias: the newest close before the entry that
// crossed the middle band (section 3.1's cross). Searched back over the
// fill's own session only, the way findEntry reads a cross — a bias doesn't
// carry into the next morning, so a session with no cross before the fill set
// no bias at all. That leaves a trade taken on something other than a cross
// (a 4x break, say) unknown here, where section 8's wording alone would judge
// it from the last closed 15m bar. **(confirm)**
export function crossIndex(bars15, day) {
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
//
// Minute bars, where the entry gate reads a 5m bar, so the two gates sit on
// different clocks: this one wants the closest price to the fill, and that
// minute usually falls inside a 5m period still forming. An overlap needs a
// finished bar, so the entry gate waits for one.
export function underlyingAt(bars, asOf, day) {
  const time = asOf.getTime();
  for (let i = bars.length - 1; i >= 0; i--) {
    if (Date.parse(bars[i].t) + MINUTE <= time) {
      return tradingDay(bars[i]) === day ? bars[i].c : null;
    }
  }
  return null;
}

// [rules-v3 4] Where a trade's entry sat among the day's levels: { location,
// room } from levelLocation and levelRoom, on the level map as of the fill
// (levelMap; `dailyBars` and `dailyPlan` as it takes them). Room runs from the
// underlying's price at the fill to the invalidation level: an option's stop
// on the underlying, never its premium stop; a stock's own stop. Null for a
// plan that was never entered.
export function levelsAtEntry(trade, bars = [], { dailyBars = [], dailyPlan = null } = {}) {
  if (!trade.openedAt) return null;
  const asOf = trade.openedAt;
  const bias = tradeBias(trade);
  const levels = levelMap({ bars, dailyBars, dailyPlan, asOf });
  const invalidation = trade.assetClass === 'option' ? trade.underlyingStop : trade.initialStop;
  return {
    location: levelLocation({ levels, bars, asOf, bias }),
    room: levelRoom({
      levels,
      price: underlyingAt(bars, asOf, tradingDay({ t: asOf.toISOString() })),
      bias,
      invalidation: invalidation ?? null,
    }),
  };
}

// A trade's gates, keyed by name, as gradeGates returns them. `bars` are the
// underlying's minute bars around the entry; `dailyPlan` is the day's plan row
// and `planEntry` the trade's plan journal entry, both null when there is
// none; `location` is levelsAtEntry's, null when it wasn't worked out (the
// gate is then unknown).
export function gradeTradeGates(trade, bars = [], { dailyPlan = null, planEntry = null, location = null } = {}) {
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
  // The 15m bars keep the earlier sessions, since the bands need twenty bars
  // of history; only the cross itself has to be the fill's own (crossIndex).
  const bars15 = resample(bars, 15, { asOf });
  const bars5 = sessionOf(resample(bars, 5, { asOf }), day);
  // The 5m bar the entry is judged on is the last one that closed before the
  // fill, not the setup's ideal entry candle: section 3.1 enters at the close
  // of a 5m candle, and grading the candle findEntry picks would pass by
  // definition, since finding it requires the overlap this gate asks about.
  // Section 8 says only "5m entry candle". **(confirm)**
  return gradeGates({
    ...recorded,
    // The side the trade bets on the underlying, so a bought put reads short.
    direction: tradeBias(trade),
    bars15,
    directionBarIndex: crossIndex(bars15, day),
    entryBar: bars5.at(-1) ?? null,
    entryPrevBar: bars5.at(-2) ?? null,
    location,
  });
}
