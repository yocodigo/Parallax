// Period-over-period simple returns from a close-price series. "Period" is
// whatever bar timeframe was requested (minute, hour, day, week, month),
// so any correlation computed from these is on that same timeframe.
export function periodReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

// Bars in the rolling correlation's trailing window (market-views.md
// section 4, marked (confirm)).
export const ROLL = 20;

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  const meanA = a.reduce((s, x) => s + x, 0) / n;
  const meanB = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

// Given { SYMBOL: closes[] }, returns a nested map of pairwise return
// correlations: matrix[A][B] = Pearson correlation of A's and B's returns.
export function correlationMatrix(closesBySymbol) {
  const symbols = Object.keys(closesBySymbol);
  const returns = {};
  for (const s of symbols) returns[s] = periodReturns(closesBySymbol[s]);

  const matrix = {};
  for (const a of symbols) {
    matrix[a] = {};
    for (const b of symbols) {
      matrix[a][b] = pearson(returns[a], returns[b]);
    }
  }
  return matrix;
}

// Correlation of the returns of `a` and `b` over the trailing `window`
// returns, at each date: [{ date, correlation }], with a null correlation
// until a full window of returns exists. `rows` are date-keyed prices; only
// the bars where both symbols have a price are used.
export function rollingCorrelation(rows, a, b, window = ROLL) {
  const both = rows.filter((row) => row[a] != null && row[b] != null);
  const returnsA = periodReturns(both.map((row) => row[a]));
  const returnsB = periodReturns(both.map((row) => row[b]));

  return both.map((row, i) => ({
    date: row.date,
    // Return k ends at close k + 1, so the window ending at close i is the
    // returns i - window to i - 1.
    correlation: i < window ? null : pearson(returnsA.slice(i - window, i), returnsB.slice(i - window, i)),
  }));
}
