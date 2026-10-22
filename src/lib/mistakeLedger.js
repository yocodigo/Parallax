import { rMultiple } from './tradeMetrics';

const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

// What each mistake has cost, in R. `trades` are trades with a `mistakes`
// array: every tag from the journal entries about that trade. A trade counts
// once per mistake, and only once it's closed and has an R.
//
// Returns { mistakes, baseline, trades }: per mistake the trades tagged with
// it and their total and average R, costliest first; the average R of trades
// with no mistakes, to compare against; and how many trades were counted.
export function mistakeLedger(trades) {
  const rsByMistake = new Map();
  const cleanRs = [];
  let counted = 0;

  for (const trade of trades) {
    const r = rMultiple(trade);
    if (r === null) continue;
    counted += 1;

    const mistakes = new Set(trade.mistakes);
    if (mistakes.size === 0) cleanRs.push(r);
    for (const mistake of mistakes) {
      if (!rsByMistake.has(mistake)) rsByMistake.set(mistake, []);
      rsByMistake.get(mistake).push(r);
    }
  }

  const mistakes = [...rsByMistake]
    .map(([mistake, rs]) => ({
      mistake,
      trades: rs.length,
      totalR: rs.reduce((sum, r) => sum + r, 0),
      averageR: average(rs),
    }))
    // Most R lost first; among equal losses, the habit that shows up more.
    .sort((a, b) => a.totalR - b.totalR || b.trades - a.trades);

  return {
    mistakes,
    baseline: { trades: cleanRs.length, averageR: average(cleanRs) },
    trades: counted,
  };
}
