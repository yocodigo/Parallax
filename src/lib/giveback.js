import { atLeast, atMost } from './setups/compare';
import { rMultiple, tradeStatus } from './tradeMetrics';

// [11] Giveback: price went far enough the trade's way to have been a winner,
// and the trade still closed flat or red. Both limits are in R.
export const GIVEBACK_MFE_MIN = 1;
export const GIVEBACK_RESULT_MAX = 0;

// A closed trade's giveback, from its realized R and `excursion` (excursions.js's
// result for it). Returns { mfeR, r, givenBackR, flagged }, or null when there
// is nothing to measure: excursions exist for stocks only so far, and both
// figures need an initial stop to be in R. `givenBackR` is how much of the best
// open profit didn't make it to the close; it's reported for winners too, but
// only a flat or losing close is flagged.
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
