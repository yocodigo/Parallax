// Fair value gap (setups.md 2.9): the gap a bar leaves behind, between the
// bars immediately before and after it. Bullish when the bar after opens
// above the one before (low[m+1] > high[m-1]); bearish mirrors. Only an FVG
// created by the setup's own displacement bar counts — callers decide that;
// this only reports the gap's geometry, oldest-first bars. Null without a
// gap, or without a bar on both sides of `m`.

import { atMost } from './compare';

export function fairValueGap(bars, m) {
  if (m < 1 || m + 1 >= bars.length) return null;
  const before = bars[m - 1];
  const after = bars[m + 1];
  if (!atMost(after.l, before.h)) {
    return { side: 'bullish', low: before.h, high: after.l, ce: (before.h + after.l) / 2 };
  }
  if (!atMost(before.l, after.h)) {
    return { side: 'bearish', low: after.h, high: before.l, ce: (after.h + before.l) / 2 };
  }
  return null;
}
