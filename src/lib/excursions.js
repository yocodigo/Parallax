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
