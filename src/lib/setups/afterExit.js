// [rules-v3 8.3] After the exit: how far the underlying ran in the trade's
// direction in the POST_EXIT_MIN minutes after an option trade was closed, and
// whether it reached T1 then. Measured from the VWAP of the minute the exit was
// in (the price the underlying entry uses too), over the minutes after that
// one, since the exit's own minute holds prices from before it.

import { percentiles } from '../percentiles';
import { atLeast, atMost } from './compare';
import { fillBarIndex, tradeBias } from './replayTrades';
import { POST_EXIT_MIN } from './settings';

const MINUTE = 60_000;

// `bars` are the underlying's minute bars around the exit (any span covering
// it); `t1` the day's T1, or null without one. Returns { exitPrice, bars (how
// many minutes after the exit had a bar), ranFor (points, never negative),
// ranForR (structure R from the underlying stop, null without one), stopSource,
// t1, exitedPastT1, t1Reached }, or null for an open trade, one without an
// underlying entry, or when no bar holds the exit or follows it. T1 asks
// whether leaving early gave it up, so it is judged only for an exit short of
// it: `exitedPastT1` says the exit was already at or beyond T1, and then, like
// without a T1, `t1Reached` is null.
export function afterExit(trade, bars, t1) {
  if (!trade.closedAt || trade.underlyingEntry === null || trade.underlyingEntry === undefined) return null;
  const exitIndex = fillBarIndex(bars, trade.closedAt);
  const exitPrice = exitIndex === null ? null : (bars[exitIndex].vw ?? null);
  if (exitPrice === null) return null;

  const exitMinute = Math.floor(trade.closedAt.getTime() / MINUTE) * MINUTE;
  const after = bars.filter((bar) => {
    const start = Date.parse(bar.t);
    return start > exitMinute && start <= exitMinute + POST_EXIT_MIN * MINUTE;
  });
  if (after.length === 0) return null;

  const long = tradeBias(trade) === 'long';
  const high = Math.max(...after.map((bar) => bar.h));
  const low = Math.min(...after.map((bar) => bar.l));
  const ranFor = Math.max(0, long ? high - exitPrice : exitPrice - low);
  const stop = trade.underlyingStop ?? null;
  const risk = stop === null ? 0 : Math.abs(trade.underlyingEntry - stop);
  const hasT1 = t1 !== null && t1 !== undefined;
  const exitedPastT1 = hasT1 ? (long ? atLeast(exitPrice, t1) : atMost(exitPrice, t1)) : null;

  return {
    exitPrice,
    bars: after.length,
    ranFor,
    ranForR: risk ? ranFor / risk : null,
    stopSource: trade.underlyingStopSource ?? null,
    t1: t1 ?? null,
    exitedPastT1,
    t1Reached: !hasT1 || exitedPastT1 ? null : long ? atLeast(high, t1) : atMost(low, t1),
  };
}

// The after-the-exit insight over trades' afterExit results: how far the
// underlying ran on in points for every trade, in R kept apart by where the
// stop came from (never pooled), and how often T1 was reached among the trades
// whose day had one.
export function afterExitSummary(rows) {
  const rBySource = (source) => {
    const values = rows.filter((row) => row.stopSource === source && row.ranForR !== null).map((row) => row.ranForR);
    return { trades: values.length, percentiles: percentiles(values) };
  };
  const judged = rows.filter((row) => row.t1Reached !== null);
  return {
    trades: rows.length,
    points: { percentiles: percentiles(rows.map((row) => row.ranFor)) },
    r: { plan: rBySource('plan'), derived: rBySource('derived') },
    t1: { judged: judged.length, reached: judged.filter((row) => row.t1Reached).length },
  };
}
