// Displacement: a bar that moves with unusual force. `bars` are oldest first;
// `i` is the bar being judged. Nothing after `i` is read.

import { atLeast } from './compare';
import { DISP_BODY_SHARE, DISP_LOOKBACK, DISP_MULT } from './settings';

const body = (bar) => Math.abs(bar.c - bar.o);

// True when bar `i`'s body, up or down, is at least `multiple` times the
// average body of the `lookback` bars before it, and fills at least
// `bodyShare` of the bar's range (so it isn't mostly wick). False without
// enough bars before it or with no range.
export function isDisplacement(
  bars,
  i,
  { multiple = DISP_MULT, lookback = DISP_LOOKBACK, bodyShare = DISP_BODY_SHARE } = {}
) {
  if (i < lookback) return false;
  const bar = bars[i];
  const range = bar.h - bar.l;
  if (range <= 0) return false;
  const typical = bars.slice(i - lookback, i).reduce((sum, b) => sum + body(b), 0) / lookback;
  return atLeast(body(bar), multiple * typical) && atLeast(body(bar) / range, bodyShare);
}
