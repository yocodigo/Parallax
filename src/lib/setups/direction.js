// The 15m direction of setup 3.1: which side of the middle Bollinger band a
// 15m bar closed on. `bars` are 15m bars, oldest first; nothing after `i` is
// read.

import { bollinger } from './bollinger';
import { atLeast, atMost } from './compare';

// 'long' above the middle band, 'short' below, null on it. The comparison
// allows for rounding, since the average of prices like 761.10 can compute a
// hair off them.
function biasAt(bars, i) {
  const bands = bollinger(bars, i);
  if (!bands) return null;
  const { c } = bars[i];
  if (!atMost(c, bands.middle)) return { bias: 'long', middle: bands.middle };
  if (!atLeast(c, bands.middle)) return { bias: 'short', middle: bands.middle };
  return { bias: null, middle: bands.middle };
}

// The bias at the close of bar `i` and whether that close crossed the middle
// band: bar `i − 1` closed on the other side of its own middle band, or on it.
// The first bar with bands has nothing before it to cross from. Null without
// enough bars for the bands.
export function bandCross(bars, i) {
  const now = biasAt(bars, i);
  if (!now) return null;
  const before = i > 0 ? biasAt(bars, i - 1) : null;
  const crossed = now.bias !== null && before !== null && before.bias !== now.bias;
  return { bias: now.bias, crossed, middle: now.middle };
}
