// Nearest-rank percentiles (p50, p75, p90) of `values`: the pth percentile is
// the value at 1-based rank ceil(p * n) in sorted order (so index ceil(p * n)
// - 1), always a value that actually occurred. All null for no values.
export function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => (sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null);
  return { p50: at(0.5), p75: at(0.75), p90: at(0.9) };
}

// Percentiles of `valueOf(row)` for each underlying apart, most trades first
// (then by symbol): [{ symbol, trades, percentiles }]. A point of one
// underlying isn't a point of another, so they are never pooled.
export function percentilesBySymbol(rows, valueOf) {
  const groups = new Map();
  for (const row of rows) groups.set(row.symbol, [...(groups.get(row.symbol) ?? []), valueOf(row)]);
  return [...groups]
    .map(([symbol, values]) => ({ symbol, trades: values.length, percentiles: percentiles(values) }))
    .sort((a, b) => b.trades - a.trades || a.symbol.localeCompare(b.symbol));
}
