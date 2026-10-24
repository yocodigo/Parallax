// The shape of one bar, alone or against the bar before it. Bars use Alpaca's
// keys: o, h, l, c, v.

import { OVERLAP_MAX } from './settings';

// Gann's bar types: 'up' makes a higher high without a lower low, 'down' the
// mirror, 'inside' exceeds neither extreme (ties count as not exceeding), and
// 'outside' exceeds both.
export function barType(bar, prev) {
  const higherHigh = bar.h > prev.h;
  const lowerLow = bar.l < prev.l;
  if (higherHigh) return lowerLow ? 'outside' : 'up';
  return lowerLow ? 'down' : 'inside';
}

// Where the close sits in the bar's range: 0 at the low, 1 at the high. Null
// when the bar has no range, since any close is both.
export function closeLocation(bar) {
  const range = bar.h - bar.l;
  return range > 0 ? (bar.c - bar.l) / range : null;
}

// The share of the bar's range that the previous bar also covered: 0 when
// they don't meet, 1 when the previous bar spans it. Null with no range.
export function overlap(bar, prev) {
  const range = bar.h - bar.l;
  if (range <= 0) return null;
  const shared = Math.min(bar.h, prev.h) - Math.max(bar.l, prev.l);
  return Math.max(0, shared) / range;
}

// A clean break from the previous bar. A bar with no range doesn't count.
export function hasLittleOverlap(bar, prev, max = OVERLAP_MAX) {
  const share = overlap(bar, prev);
  return share !== null && share <= max;
}
