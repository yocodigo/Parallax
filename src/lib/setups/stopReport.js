// A summary of one set of stop rules replayed over many trades (setups.md
// section 5's evaluation). Each result is what replayStops returned.

// The average of the values that aren't null, or null if none are.
function averageOf(values) {
  const known = values.filter((value) => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

// How many of `results` exited for each reason.
function countByReason(results) {
  const counts = {};
  for (const { reason } of results) counts[reason] = (counts[reason] ?? 0) + 1;
  return counts;
}

// { trades, averageR, byReason (how many exited by T1, each rule, or the
// close), cutBeforeT1 (stop exits on trades that reached T1 later that day),
// cutBeforeT1ByReason (those by rule, so a combination shows which rule cut
// them), cutBeforeT1Share (of all trades), averageRWhenCut (the R of those
// exits, what being wrong cost) }. Trades without an R count everywhere but in the
// averages.
export function stopReport(results) {
  const cut = results.filter((result) => result.t1Later);
  return {
    trades: results.length,
    averageR: averageOf(results.map((result) => result.r)),
    byReason: countByReason(results),
    cutBeforeT1: cut.length,
    cutBeforeT1ByReason: countByReason(cut),
    cutBeforeT1Share: results.length ? cut.length / results.length : null,
    averageRWhenCut: averageOf(cut.map((result) => result.r)),
  };
}
