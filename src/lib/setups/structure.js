// Market structure (setups.md 2.9): BOS and MSS, both judged against a
// single confirmed swing point treated as a flat trendline (any slope,
// including flat — 2.7). `side`: a swing high is the resistance side, a
// swing low the support side.

import { isDisplacement } from './displacement';
import { breakOutcome, closesInside } from './trendline';

const sideOf = (swing) => (swing.kind === 'high' ? 'resistance' : 'support');
const levelLine = (swing) => ({ index: swing.index, price: swing.price, slope: 0 });

// BOS: bar `k` is the first close beyond `swing` (callers find it, as
// breakOutcome expects); its outcome as of bar `i`. Needs displacement and
// acceptance to count as a BOS; a reclaim fails it outright (even with
// displacement, mirroring breakOutcome's own reclaim-wins precedence); a
// break with no displacement is a drift no matter how well it holds.
// Returns { status: 'bos' | 'drift' | 'pending' | 'reclaimed', outcome }.
export function bosOutcome(bars, swing, k, i) {
  const outcome = breakOutcome(bars, levelLine(swing), sideOf(swing), k, i);
  let status = 'pending';
  if (outcome.status === 'reclaimed') status = 'reclaimed';
  else if (!isDisplacement(bars, k)) status = 'drift';
  else if (outcome.status === 'confirmed') status = 'bos';
  return { status, outcome };
}

// MSS: bar `k`'s body closes beyond `swing` — for a long reversal, past the
// last confirmed lower high; for a short, past the last confirmed higher
// low. No displacement or acceptance required.
export function isMSS(bars, swing, k) {
  return !closesInside(bars, levelLine(swing), sideOf(swing), k);
}
