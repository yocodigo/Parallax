// Pools (setups.md 2.8/3.3): a sellside pool is >= 2 equal swing lows, a
// buyside pool >= 2 equal swing highs. "Equal" within TOL of each other
// (2.7's own tolerance), scaled by the ATR as of the later one. Reported as
// the low and high price of the cluster rather than one level, since real
// swing points rarely land on the exact same price.

import { atMost } from './compare';
import { atr } from './relative';
import { TOL } from './settings';

// A sellside pool (equal lows) sits on the support side, a buyside pool
// (equal highs) on the resistance side — matching sweep.js and trendline.js's
// support/resistance vocabulary rather than setups.md's own.
const KINDS = [
  { side: 'support', pivot: 'low' },
  { side: 'resistance', pivot: 'high' },
];

// Whether two swing points of the same kind are close enough to count as the
// same level. False without enough history for the ATR as of the later one.
function areEqual(bars, a, b) {
  const range = atr(bars, Math.max(a.index, b.index));
  if (range === null) return false;
  return atMost(Math.abs(a.price - b.price), TOL * range);
}

// The pools formed by `swingList` (as returned by swings()), oldest first.
// Each is { side, low, high, touches }: touches are the member swings'
// indices, low and high their lowest and highest price. A swing joins the
// first pool it's equal to one point of; pools anchor to their first point
// rather than merging through a shared member, like a trendline's two points
// (the user's choice).
export function pools(bars, swingList) {
  const found = [];
  for (const { side, pivot } of KINDS) {
    const points = swingList.filter((s) => s.kind === pivot);
    const used = new Set();
    for (let a = 0; a < points.length; a++) {
      if (used.has(a)) continue;
      const members = [points[a]];
      for (let b = a + 1; b < points.length; b++) {
        if (used.has(b) || !areEqual(bars, points[a], points[b])) continue;
        members.push(points[b]);
        used.add(b);
      }
      if (members.length < 2) continue;
      used.add(a);
      const prices = members.map((m) => m.price);
      found.push({ side, low: Math.min(...prices), high: Math.max(...prices), touches: members.map((m) => m.index) });
    }
  }
  return found.sort((x, y) => x.touches[0] - y.touches[0]);
}
