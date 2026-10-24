// How a bar compares with the bars before it: average true range, and volume
// and range sorted into classes. `bars` are oldest first; `i` is the bar
// being measured. Nothing after `i` is read.

import { atLeast } from './compare';
import { ATR_PERIOD, RELATIVE_LOOKBACK, SPREAD_LIMITS, VOLUME_LIMITS } from './settings';

const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

// The bar's range, stretched to the previous close when the bar gapped away
// from it, so a gap counts as movement.
export function trueRange(bar, prev) {
  return Math.max(bar.h, prev.c) - Math.min(bar.l, prev.c);
}

// The plain average (not Wilder's smoothing) of the true ranges of the `n`
// bars ending at `i`. Null until each of them has a bar before it.
export function atr(bars, i, n = ATR_PERIOD) {
  if (i < n) return null;
  const ranges = [];
  for (let j = i - n + 1; j <= i; j++) ranges.push(trueRange(bars[j], bars[j - 1]));
  return average(ranges);
}

// `value(bars[i])` against its average over the `n` bars before `i`. Null
// without `n` bars before it, or when that average is 0.
function ratioToPrior(bars, i, n, value) {
  if (i < n) return null;
  const typical = average(bars.slice(i - n, i).map(value));
  return typical > 0 ? value(bars[i]) / typical : null;
}

export const volumeRatio = (bars, i, n = RELATIVE_LOOKBACK) => ratioToPrior(bars, i, n, (bar) => bar.v);
export const spreadRatio = (bars, i, n = RELATIVE_LOOKBACK) => ratioToPrior(bars, i, n, (bar) => bar.h - bar.l);

// The highest class whose limit the ratio reaches; `limits` lists the classes
// above `lowest` in ascending order.
function classOf(ratio, lowest, limits) {
  if (ratio === null) return null;
  let name = lowest;
  for (const [next, limit] of limits) if (atLeast(ratio, limit)) name = next;
  return name;
}

export const volumeClass = (ratio, limits = VOLUME_LIMITS) =>
  classOf(ratio, 'abnormally_low', [
    ['low', limits.low],
    ['average', limits.average],
    ['high', limits.high],
    ['abnormally_high', limits.abnormallyHigh],
  ]);

export const spreadClass = (ratio, limits = SPREAD_LIMITS) =>
  classOf(ratio, 'small', [
    ['average', limits.average],
    ['large', limits.large],
    ['abnormally_large', limits.abnormallyLarge],
  ]);
