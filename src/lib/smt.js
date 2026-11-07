// SMT divergence (market-views.md section 4): a bar where one of a correlated
// pair makes a new window high or low and the other does not. `rebased` are
// the rows from rebaseSeries, so a value is the percent change from the first
// bar of the window and "the window" is what is on screen. A new high is a
// value strictly above every earlier bar in the window (equalling it does not
// count), a new low strictly below. The first bar is the starting point, so it
// is never a divergence. Only bars where both symbols have a value are used.
//
// Returns [{ date, kind: 'high' | 'low', made, missed, value }]: `made` is the
// symbol that made the extreme, `value` its percent change at that bar.
export function smtDivergences(rebased, a, b) {
  const rows = rebased.filter((row) => row[a] !== undefined && row[b] !== undefined);
  if (rows.length === 0) return [];

  const high = { [a]: rows[0][a], [b]: rows[0][b] };
  const low = { ...high };
  const found = [];

  for (const row of rows.slice(1)) {
    for (const [kind, extreme, beats] of [
      ['high', high, (value, best) => value > best],
      ['low', low, (value, best) => value < best],
    ]) {
      const madeA = beats(row[a], extreme[a]);
      const madeB = beats(row[b], extreme[b]);
      if (madeA !== madeB) {
        const [made, missed] = madeA ? [a, b] : [b, a];
        found.push({ date: row.date, kind, made, missed, value: row[made] });
      }
      if (madeA) extreme[a] = row[a];
      if (madeB) extreme[b] = row[b];
    }
  }
  return found;
}
