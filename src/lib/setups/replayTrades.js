// Runs the stop replay over journal trades (setups.md section 5's
// evaluation). Trades are rows of the trades table; bars are SPY 1m bars with
// Alpaca's keys, oldest first.

import { replayStops } from './stopReplay';
import { stopReport } from './stopReport';

const MINUTE = 60_000;

// Which way a trade bets on the underlying: a bought call or a long stock is
// long, a bought put short; a sold option is the other way.
export function tradeBias(trade) {
  if (trade.assetClass !== 'option') return trade.direction;
  const bought = trade.optionType === 'call' ? 'long' : 'short';
  if (trade.direction === 'long') return bought;
  return bought === 'long' ? 'short' : 'long';
}

// The index of the 1m bar the fill at `openedAt` happened in, or null when no
// bar covers it.
export function fillBarIndex(bars, openedAt) {
  const time = openedAt.getTime();
  const index = bars.findIndex((bar) => {
    const start = Date.parse(bar.t);
    return start <= time && time < start + MINUTE;
  });
  return index < 0 ? null : index;
}

// Replays each set of `ruleSets` (such as ['S2'] or ['S1', 'S2']) over
// `trades`, with barsFor(trade) giving the bars around each trade's entry and
// t1For(trade) its T1, if any. Returns { replayed, skipped (trades without a
// bar covering the fill), ruleSets: [{ rules, ...stopReport }] }.
export function replayTrades(trades, barsFor, ruleSets, { t1For = () => null } = {}) {
  const results = ruleSets.map(() => []);
  let skipped = 0;
  for (const trade of trades) {
    const bars = barsFor(trade);
    // The replay enters at the fill bar's close, so its entry can differ a
    // little from the journal's fill time and price.
    const entryIndex = fillBarIndex(bars, trade.openedAt);
    if (entryIndex === null) {
      skipped += 1;
      continue;
    }
    const bias = tradeBias(trade);
    const t1 = t1For(trade);
    ruleSets.forEach((rules, n) => results[n].push(replayStops({ bars, entryIndex, bias, t1, rules })));
  }
  return {
    replayed: trades.length - skipped,
    skipped,
    ruleSets: ruleSets.map((rules, n) => ({ rules, ...stopReport(results[n]) })),
  };
}
