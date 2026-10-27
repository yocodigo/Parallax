// Swing points and what they say about trend and range. `bars` are oldest
// first; `i` is the latest closed bar. Nothing after `i` is read.

import { atLeast, atMost } from './compare';
import { MID_RANGE, SWING_K } from './settings';

// True when `value(bars[j])` beats every bar within `k` on each side, as
// judged by `beats` (strictly, so equal neighbors rule it out).
function standsOut(bars, j, k, value, beats) {
  for (let n = j - k; n <= j + k; n++) {
    if (n !== j && !beats(value(bars[j]), value(bars[n]))) return false;
  }
  return true;
}

// The swings confirmed by the close of bar `i`, oldest first: each is
// { index, kind: 'high' | 'low', price }. A swing at bar j needs `k` bars
// after it, so the newest one possible is at i − k. One bar can be both.
export function swings(bars, i, k = SWING_K) {
  const found = [];
  for (let j = k; j <= i - k; j++) {
    if (standsOut(bars, j, k, (bar) => bar.h, (a, b) => a > b)) found.push({ index: j, kind: 'high', price: bars[j].h });
    if (standsOut(bars, j, k, (bar) => bar.l, (a, b) => a < b)) found.push({ index: j, kind: 'low', price: bars[j].l });
  }
  return found;
}

// The last two prices of each kind of swing, oldest first.
const lastTwo = (list, kind) =>
  list
    .filter((s) => s.kind === kind)
    .slice(-2)
    .map((s) => s.price);

// From the last two swing highs and last two swing lows: 'up' for a higher
// high and a higher low, 'down' for a lower high and a lower low, 'range'
// for anything else. Null without two of each.
export function trend(swingList) {
  const highs = lastTwo(swingList, 'high');
  const lows = lastTwo(swingList, 'low');
  if (highs.length < 2 || lows.length < 2) return null;
  if (highs[1] > highs[0] && lows[1] > lows[0]) return 'up';
  if (highs[1] < highs[0] && lows[1] < lows[0]) return 'down';
  return 'range';
}

// From the last swing low to the last swing high, or null without both.
export function dealingRange(swingList) {
  const [low] = lastTwo(swingList, 'low').slice(-1);
  const [high] = lastTwo(swingList, 'high').slice(-1);
  return low === undefined || high === undefined ? null : { low, high };
}

// Whether `price` sits in the middle of the range (40% to 60% by default).
export function isMidRange(price, { low, high }, { from, to } = MID_RANGE) {
  const share = (price - low) / (high - low);
  return atLeast(share, from) && atMost(share, to);
}
