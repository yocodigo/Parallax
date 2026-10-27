// Trendlines and their touches (setups.md 2.7). A line runs through two
// swing points, swing lows for support and swing highs for resistance, and is
// projected forward. Bars use Alpaca's keys, oldest first.

import { atLeast, atMost } from './compare';
import { atr } from './relative';
import { BOUNCE, N_ACC, N_RECLAIM, TOL } from './settings';

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
  const reach = support ? bar.h - level : level - bar.l;
  return {
    atLine: atMost(Math.abs(near - level), TOL * range) && closesInside(bars, line, side, k),
    away: atLeast(reach, BOUNCE * range),
  };
}

// Whether bar `k` moved BOUNCE away from the line by its far extreme (its high
// for support, its low for resistance). False without enough history for the
// ATR.
export function isAway(bars, line, side, k) {
  return position(bars, line, side, k)?.away ?? false;
}

// Whether bar `k` comes back to the line: its low (high for resistance)
// within TOL of it or past it, so a bar that crosses the line counts. This is
// where an approach starts (setups.md 2.7). False without enough history for
// the ATR.
export function reachesLine(bars, line, side, k) {
  const range = atr(bars, k);
  if (range === null) return false;
  const level = lineAt(line, k);
  return side === 'support' ? atMost(bars[k].l, level + TOL * range) : atLeast(bars[k].h, level - TOL * range);
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

// Whether bar `k` closes on the line's original side (on the line counts).
export function closesInside(bars, line, side, k) {
  const level = lineAt(line, k);
  return side === 'support' ? atLeast(bars[k].c, level) : atMost(bars[k].c, level);
}

// True when no bar from `from` to `to` closes through the line. Wicks through
// it that close back are sweeps and leave it intact.
export function isUnbroken(bars, line, side, from, to) {
  for (let k = from; k <= to; k++) {
    if (!closesInside(bars, line, side, k)) return false;
  }
  return true;
}

// What followed bar `b` as of bar `i` (setups.md 2.8). `b` must be the first
// close through the line; callers find it, and this doesn't check.
// Reclaimed: a close back inside within N_RECLAIM bars, which wins even after
// acceptance. Accepted: the N_ACC closes after the break all stayed beyond.
// Confirmed: accepted, with the reclaim window passed. Pending otherwise.
// Returns { status, acceptedAt, reclaimedAt }.
export function breakOutcome(bars, line, side, b, i) {
  let reclaimedAt = null;
  for (let k = b + 1; k <= Math.min(b + N_RECLAIM, i); k++) {
    if (closesInside(bars, line, side, k)) {
      reclaimedAt = k;
      break;
    }
  }
  const acceptEnd = b + N_ACC;
  let acceptedAt = null;
  if (acceptEnd <= i) {
    // Accepted only if every close it needed stayed beyond. While N_ACC is at
    // most N_RECLAIM, a close back inside here is already a reclaim, so this
    // keeps acceptedAt null rather than claiming an acceptance that failed.
    let held = true;
    for (let k = b + 1; k <= acceptEnd; k++) if (closesInside(bars, line, side, k)) held = false;
    if (held) acceptedAt = acceptEnd;
  }
  let status = 'pending';
  if (reclaimedAt !== null) status = 'reclaimed';
  else if (acceptedAt !== null) status = i >= b + N_RECLAIM ? 'confirmed' : 'accepted';
  return { status, acceptedAt, reclaimedAt };
}
