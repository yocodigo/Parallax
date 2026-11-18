// [rules-v3 8.9] Entry timing: each entry against its setup's trigger bar, the
// bar that completed the setup (detected.js's completedAt). On the trigger:
// filled before the bar after it closed. Late: 1 to DETECTED_MAX_BARS bars of
// its timeframe after that. Early: the trigger bar closed after the fill,
// within DETECTED_MAX_BARS bars, the entered_before_confirmation mistake
// detected instead of self-reported. Early reads bars after the fill, so this
// is a review-time measure, never stored.
//
// The trigger is the setup of the strategy's own detector when it names one,
// else any detector's setup the trade's way, whichever is nearest the fill;
// only setups there to trade count (TRADABLE). A tie goes to the one before
// the fill.

import { percentiles, percentilesBySymbol } from '../percentiles';
import { detectSetups } from './detected';
import { TRADABLE } from './gates';
import { DETECTED_MAX_BARS } from './settings';

const MINUTE = 60_000;
const TIMEFRAMES = { '1m': 1, '5m': 5 };
const TIMINGS = ['early', 'on', 'late', 'none'];

const timed = (setup, timing, bars) => ({
  timing,
  bars,
  setup: { detector: setup.detector, timeframe: setup.timeframe, status: setup.status, grade: setup.grade },
});

// `trade`'s timing on `bars` (the underlying's minute bars, reaching past the
// fill by DETECTED_MAX_BARS 5m bars), `detector` its strategy's (null when
// none), `levels` the level map for the three-gate entry. Returns { timing,
// bars, setup } or { timing: 'none' }; null for a plan never entered or
// without bars.
export function entryTiming(trade, bars, { detector = null, levels = [] } = {}) {
  if (!trade.openedAt || !bars?.length) return null;
  const counts = (setup) => (!detector || setup.detector === detector) && TRADABLE.includes(setup.status);

  const candidates = detectSetups(trade, bars, { levels })
    .filter((setup) => counts(setup) && setup.barsSince <= DETECTED_MAX_BARS)
    .map((setup) => timed(setup, setup.barsSince === 0 ? 'on' : 'late', setup.barsSince));

  // Early: step a bar of each timeframe at a time past the bar holding the
  // fill, and take the first trigger bar that closed after the fill.
  const fill = trade.openedAt.getTime();
  for (const [timeframe, minutes] of Object.entries(TIMEFRAMES)) {
    const span = minutes * MINUTE;
    const holding = Math.floor(fill / span) * span;
    for (let k = 1; k <= DETECTED_MAX_BARS; k++) {
      const asOf = new Date(holding + k * span);
      const found = detectSetups({ ...trade, openedAt: asOf }, bars, { levels }).find(
        (setup) => setup.timeframe === timeframe && counts(setup) && Date.parse(setup.completedAt) + span > fill
      );
      if (found) {
        candidates.push(timed(found, 'early', k));
        break;
      }
    }
  }

  if (candidates.length === 0) return { timing: 'none' };
  // Nearest first; at the same distance, the one already there at the fill.
  const rank = (c) => c.bars * 2 + (c.timing === 'early' ? 1 : 0);
  return candidates.reduce((best, c) => (rank(c) < rank(best) ? c : best));
}

// The groups of `rows` (each { timing, symbol, netPnl, heat }, heat the
// underlying's excursion or null) in the order early, on, late, none: trades,
// net P/L (summed in cents), and the heat they took, in points per underlying
// (never pooled) and in R over the trades with a stop (`measured` of them).
export function entryTimingSummary(rows) {
  return TIMINGS.map((timing) => {
    const group = rows.filter((row) => row.timing === timing);
    const measured = group.filter((row) => row.heat);
    const withR = measured.filter((row) => row.heat.maeR !== null && row.heat.maeR !== undefined);
    return {
      timing,
      trades: group.length,
      netPnl: group.reduce((cents, row) => cents + Math.round(row.netPnl * 100), 0) / 100,
      heatPoints: percentilesBySymbol(measured, (row) => row.heat.mae),
      heatR: { measured: withR.length, percentiles: percentiles(withR.map((row) => row.heat.maeR)) },
    };
  });
}
