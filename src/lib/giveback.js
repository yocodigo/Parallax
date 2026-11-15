import { underlyingExcursions } from './excursions';
import { atLeast, atMost } from './setups/compare';
import { fillBarIndex, tradeBias } from './setups/replayTrades';
import { rMultiple, tradeStatus } from './tradeMetrics';

// [11] Giveback limits, in R: a closed trade is flagged when its best open
// profit (MFE) reached GIVEBACK_MFE_MIN and its result was GIVEBACK_RESULT_MAX
// or worse.
export const GIVEBACK_MFE_MIN = 1;
export const GIVEBACK_RESULT_MAX = 0;

// A closed trade's giveback, from its realized R and `excursion` (excursions.js's
// result for it). Returns { mfeR, r, givenBackR, flagged }, or null when there
// is nothing to measure: excursions exist for stocks only so far, and both
// figures need an initial stop to be in R. `givenBackR` is how much of the best
// open profit didn't make it to the close; it's reported for winners too, but
// only a flat or losing close is flagged. MFE comes from bar prices, gross of
// fees, while the result is net of them, so fees count as given back.
export function giveback(trade, excursion) {
  if (trade.assetClass !== 'stock' || tradeStatus(trade) !== 'closed') return null;
  const mfeR = excursion?.mfeR ?? null;
  const r = rMultiple(trade);
  if (mfeR === null || r === null) return null;
  return {
    mfeR,
    r,
    givenBackR: mfeR - r,
    flagged: atLeast(mfeR, GIVEBACK_MFE_MIN) && atMost(r, GIVEBACK_RESULT_MAX),
  };
}

const MINUTE = 60_000;

// An option's giveback on its underlying (rules-v3 section 7), from `bars`,
// the underlying's minute bars around the trade (any span covering it; only
// the minutes from the fill to the exit are read). The best open move is the
// underlying's MFE from `underlyingEntry`; the result is the move from there
// to the VWAP of the minute the trade was closed in (the same price the entry
// uses), so it is gross of the option's fees and its premium decay. Returns
// { mfe, result, givenBack } in points and, with a stop on the underlying,
// { mfeR, r, givenBackR, flagged } in structure R (null without one: a trade
// with no stop can't be judged against the 1R line), plus the stop's source and
// the edge-minutes flag. Null for an open trade, without an underlying entry,
// or when no bar holds the exit.
export function underlyingGiveback(trade, bars) {
  if (tradeStatus(trade) !== 'closed' || trade.underlyingEntry === null || trade.underlyingEntry === undefined) {
    return null;
  }
  const from = Math.floor(trade.openedAt.getTime() / MINUTE) * MINUTE;
  const to = Math.floor(trade.closedAt.getTime() / MINUTE) * MINUTE;
  const open = bars.filter((bar) => Date.parse(bar.t) >= from && Date.parse(bar.t) <= to);
  const exitIndex = fillBarIndex(open, trade.closedAt);
  const excursion = underlyingExcursions(trade, open);
  if (exitIndex === null || !excursion) return null;

  const exitPrice = open[exitIndex].vw ?? null;
  if (exitPrice === null) return null;
  const result = (exitPrice - trade.underlyingEntry) * (tradeBias(trade) === 'long' ? 1 : -1);
  const risk = trade.underlyingStop === null || trade.underlyingStop === undefined ? 0 : Math.abs(trade.underlyingEntry - trade.underlyingStop);
  const r = risk ? result / risk : null;

  return {
    mfe: excursion.mfe,
    result,
    givenBack: excursion.mfe - result,
    mfeR: excursion.mfeR,
    r,
    givenBackR: r === null ? null : excursion.mfeR - r,
    flagged: r === null ? null : atLeast(excursion.mfeR, GIVEBACK_MFE_MIN) && atMost(r, GIVEBACK_RESULT_MAX),
    stopSource: excursion.stopSource,
    edgeMinutesOnly: excursion.edgeMinutesOnly,
  };
}
