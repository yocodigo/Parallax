// SMT divergence (market-views.md section 4): a bar where one of a correlated
// pair makes a new window high or low and the other does not. `rebased` are
// the rows from rebaseSeries, so a value is the percent change from that
// symbol's first bar in the window, and "the window" is what is on screen. A
// new high is a value strictly above every earlier value of the same symbol
// (equalling it does not count), a new low strictly below.
//
// Each symbol's highs and lows are tracked over every row where it has a
// value, as the chart draws them. A bar is judged only when both symbols have
// a value and both have an earlier one: a symbol's first bar only starts its
// window, so it is never a divergence.
//
// Returns [{ date, kind: 'high' | 'low', made, missed, value }]: `made` is the
// symbol that made the extreme, `value` its percent change at that bar.
const beats = (kind, value, best) => (kind === 'high' ? value > best : value < best);

export function smtDivergences(rebased, a, b) {
  const extremes = {}; // { symbol: { high, low } } over the rows seen so far
  const found = [];

  for (const row of rebased) {
    if (row[a] !== undefined && row[b] !== undefined && extremes[a] && extremes[b]) {
      for (const kind of ['high', 'low']) {
        const madeA = beats(kind, row[a], extremes[a][kind]);
        const madeB = beats(kind, row[b], extremes[b][kind]);
        if (madeA !== madeB) {
          const [made, missed] = madeA ? [a, b] : [b, a];
          found.push({ date: row.date, kind, made, missed, value: row[made] });
        }
      }
    }

    for (const symbol of [a, b]) {
      const value = row[symbol];
      if (value === undefined) continue;
      const seen = extremes[symbol];
      extremes[symbol] = seen
        ? { high: Math.max(seen.high, value), low: Math.min(seen.low, value) }
        : { high: value, low: value };
    }
  }
  return found;
}
