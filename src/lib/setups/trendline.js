// Trendlines and their touches (setups.md 2.7). A line runs through two
// swing points, swing lows for support and swing highs for resistance, and is
// projected forward. Bars use Alpaca's keys, oldest first.

import { atLeast, atMost } from './compare';
import { atr } from './relative';
import { BOUNCE, TOL } from './settings';

// The line through points { index, price }, any slope, flat included.
export function lineThrough(a, b) {
  return { index: a.index, price: a.price, slope: (b.price - a.price) / (b.index - a.index) };
}

export const lineAt = (line, k) => line.price + line.slope * (k - line.index);

// How bar `k` sits against the line, with TOL and BOUNCE scaled by the ATR as
// of that bar. At the line: its low (high for resistance) within TOL of the
// line, closing on the right side. Away: its high (low for resistance) at
// least BOUNCE from it.
function position(bars, line, side, k) {
  const range = atr(bars, k);
  if (range === null) return null;
  const bar = bars[k];
  const level = lineAt(line, k);
  const support = side === 'support';
  const near = support ? bar.l : bar.h;
  const rightSide = support ? atLeast(bar.c, level) : atMost(bar.c, level);
  const reach = support ? bar.h - level : level - bar.l;
  return {
    atLine: atMost(Math.abs(near - level), TOL * range) && rightSide,
    away: atLeast(reach, BOUNCE * range),
  };
}

// The bars from `from` to `to` that count as touches. A bar at the line is a
// new touch only if some bar between it and the last counted touch moved
// away; otherwise it merges into that touch. A merged bar can itself have
// moved away, when its far extreme reaches BOUNCE, and then the next bar at
// the line is a new touch: that is what makes bar 7 of the four-touch example
// its 4th touch, so a run of wide bars at the line counts every other bar.
// Bars without enough history for the ATR are skipped.
export function lineTouches(bars, line, side, from, to) {
  const touches = [];
  let movedAway = true;
  for (let k = from; k <= to; k++) {
    const here = position(bars, line, side, k);
    if (!here) continue;
    if (here.atLine && movedAway) {
      touches.push(k);
      movedAway = false;
    } else if (here.away) {
      movedAway = true;
    }
  }
  return touches;
}

// True when no bar from `from` to `to` closes through the line. Wicks through
// it that close back are sweeps and leave it intact.
export function isUnbroken(bars, line, side, from, to) {
  for (let k = from; k <= to; k++) {
    const level = lineAt(line, k);
    const closesThrough = side === 'support' ? !atLeast(bars[k].c, level) : !atMost(bars[k].c, level);
    if (closesThrough) return false;
  }
  return true;
}
