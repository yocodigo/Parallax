// Bollinger Bands on one timeframe's bars, oldest first.

import { BOLLINGER_DEVIATIONS, BOLLINGER_PERIOD } from './settings';

// The bands at the close of bar `i`: the middle is the average close of the
// `period` bars ending at `i`, and the outer bands sit `deviations` standard
// deviations above and below it. The deviation divides by `period` (not
// period − 1), as charting platforms do. Null without enough bars.
export function bollinger(bars, i, { period = BOLLINGER_PERIOD, deviations = BOLLINGER_DEVIATIONS } = {}) {
  if (i < period - 1) return null;
  const closes = bars.slice(i - period + 1, i + 1).map((bar) => bar.c);
  const middle = closes.reduce((sum, c) => sum + c, 0) / period;
  const variance = closes.reduce((sum, c) => sum + (c - middle) ** 2, 0) / period;
  const width = deviations * Math.sqrt(variance);
  return { middle, upper: middle + width, lower: middle - width };
}
