import { tradeBias } from './setups/replayTrades';
import { edgeSplit } from './tradeWindow';

// Maximum adverse and favorable excursion: how far the price went against a
// trade, and in its favor, while it was open. Computed from bars on demand,
// never stored.

const DAY_MS = 24 * 60 * 60 * 1000;

// Bar size for a holding period, picked so a single request stays far below
// Alpaca's 10,000-bar limit (~390 minute bars or ~7 hourly bars a session).
export function barTimeframeFor(openedAt, closedAt) {
  const days = (closedAt - openedAt) / DAY_MS;
  if (days <= 7) return '1Min';
  if (days <= 366) return '1Hour';
  return '1Day';
}

const BAR_MS = { '1Min': 60 * 1000, '1Hour': 60 * 60 * 1000, '1Day': DAY_MS };

// Which bars to fetch for a trade: from the start of the bar holding the fill
// (so the entry bar's range counts) to the exit, or to `now` while it's open.
export function barWindow(trade, now = new Date()) {
  const end = trade.closedAt ?? now;
  const timeframe = barTimeframeFor(trade.openedAt, end);
  const size = BAR_MS[timeframe];
  return { timeframe, start: new Date(Math.floor(trade.openedAt.getTime() / size) * size), end };
}

// `bars` are the bars ({ h, l }) the trade was open for. Returns { mae, mfe }
// in price per share (or per contract premium), each zero or more, plus
// { maeR, mfeR } in units of the initial risk; null without bars.
export function excursions(trade, bars) {
  if (bars.length === 0) return null;

  const high = Math.max(...bars.map((bar) => bar.h));
  const low = Math.min(...bars.map((bar) => bar.l));
  const entry = trade.entryPrice;
  const [against, inFavor] = trade.direction === 'long' ? [entry - low, high - entry] : [high - entry, entry - low];

  // The free data feed's prices can differ a little from where the fill
  // happened, so a side the price "never reached" is zero, not negative.
  const mae = Math.max(0, against);
  const mfe = Math.max(0, inFavor);
  const risk = trade.initialStop === null || trade.initialStop === undefined ? 0 : Math.abs(entry - trade.initialStop);

  return {
    mae,
    mfe,
    maeR: risk ? mae / risk : null,
    mfeR: risk ? mfe / risk : null,
  };
}

// How far the underlying went against an option's bet and in its favor
// (rules-v3 section 7: structure R), from `bars`, the underlying's minute bars
// from the start of the fill's minute to the exit. In points from
// `underlyingEntry`, and in R from `underlyingStop` when there is one (with
// where that stop came from, so a planned and a derived one stay apart).
// A trade held under two minutes is flagged `edgeMinutesOnly` and also
// measured on the bars strictly between its fill and exit minutes (`between`,
// null when there are none, or when the trade isn't edge-only). Null without
// an underlying entry or bars.
export function underlyingExcursions(trade, bars) {
  const entry = trade.underlyingEntry;
  if (entry === null || entry === undefined || bars.length === 0) return null;

  const stop = trade.underlyingStop ?? null;
  const risk = stop === null ? 0 : Math.abs(entry - stop);
  const long = tradeBias(trade) === 'long';
  const measure = (list) => {
    const high = Math.max(...list.map((bar) => bar.h));
    const low = Math.min(...list.map((bar) => bar.l));
    const mae = Math.max(0, long ? entry - low : high - entry);
    const mfe = Math.max(0, long ? high - entry : entry - low);
    return { mae, mfe, maeR: risk ? mae / risk : null, mfeR: risk ? mfe / risk : null };
  };

  const { edgeMinutesOnly, between } = edgeSplit(bars, trade.openedAt, trade.closedAt ?? null);
  return {
    ...measure(bars),
    stopSource: trade.underlyingStopSource ?? null,
    stopRule: trade.underlyingStopRule ?? null,
    edgeMinutesOnly,
    between: edgeMinutesOnly && between.length > 0 ? measure(between) : null,
  };
}
