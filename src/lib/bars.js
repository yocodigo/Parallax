// Merge per-symbol bar arrays into date-keyed rows suitable for charting:
//   [{ date: '2026-07-01', AAPL: 210.4, MSFT: 505.1 }, ...]
export function reshapeBars(bars) {
  const rows = new Map();
  for (const symbol of Object.keys(bars)) {
    for (const bar of bars[symbol]) {
      const date = bar.t.slice(0, 10);
      if (!rows.has(date)) rows.set(date, { date });
      rows.get(date)[symbol] = bar.c;
    }
  }
  return Array.from(rows.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

// Latest close and period change per symbol, for the summary cards.
export function summarize(bars, symbols) {
  return symbols
    .filter((s) => bars[s]?.length)
    .map((symbol) => {
      const symbolBars = bars[symbol];
      const first = symbolBars[0].c;
      const last = symbolBars[symbolBars.length - 1].c;
      return {
        symbol,
        last,
        change: last - first,
        changePct: first ? ((last - first) / first) * 100 : 0,
        bars: symbolBars.length,
      };
    });
}

// Rebase date-keyed rows to percent change from each symbol's first price in
// the rows, so tickers of any price level share one scale. The prices stay
// under `prices` for the tooltip. Recomputed whenever the window changes.
export function rebaseSeries(series, symbols) {
  const base = {};
  return series.map((row) => {
    const out = { date: row.date, prices: {} };
    for (const symbol of symbols) {
      const price = row[symbol];
      if (price == null) continue;
      if (base[symbol] === undefined) base[symbol] = price;
      out.prices[symbol] = price;
      // A first price of 0 can't be a base; leave the line flat at 0%.
      out[symbol] = base[symbol] ? ((price - base[symbol]) / base[symbol]) * 100 : 0;
    }
    return out;
  });
}

// Tooltip text for a rebased point: signed percent change and the actual price.
export function rebasedLabel(pct, price) {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% ($${price.toFixed(2)})`;
}

// Rebased rows with the benchmark's percent change taken off every line, so
// the benchmark itself is flat at 0 and above 0 means outperforming it. A
// point is left out where the line or the benchmark has no price that day.
// The input rows (and their `prices`, for the tooltip) are not changed.
export function relativeStrength(rebased, symbols, benchmark) {
  return rebased.map((row) => {
    const out = { date: row.date, prices: row.prices };
    for (const symbol of symbols) {
      if (row[symbol] === undefined || row[benchmark] === undefined) continue;
      out[symbol] = row[symbol] - row[benchmark];
    }
    return out;
  });
}

// Tooltip text for a relative point: signed percentage points and the price.
export function relativeLabel(points, price) {
  return `${points >= 0 ? '+' : ''}${points.toFixed(2)} pts ($${price.toFixed(2)})`;
}
