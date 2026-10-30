// Three-gate entry (setups.md 3.4): a generic trigger at any level, not tied
// to one setup. Gate 1: a sweep of the level (sweep.js). Gate 2: the same
// bar's close sits in the far half of its own range, at least REJECTION_CL_MIN
// for a long and at most it for a short — closing back inside is sweep.js's
// own bar, this asks for a clean rejection rather than a bare reclaim. Gate 3: within
// TRIGGER_WINDOW bars, price trades beyond that bar's high (long) or low
// (short). No entry when the level sits in the mid-range of the dealing
// range known as of the sweep (setups.md 2.5) — the same "knowable at the
// time" anchor reversalSequence.js uses for its own structure; without a
// confirmed dealing range yet, there's nothing to call mid-range, so the gate
// doesn't block. The first sweep that clears every gate wins; one that
// doesn't is just a sweep, so a later sweep of the same level still gets a
// chance. Bars are oldest first; nothing after `i` is read.

import { closeLocation } from './candles';
import { atLeast, atMost } from './compare';
import { atr } from './relative';
import { REJECTION_CL_MIN, STOP_BUFFER, SWING_K, TRIGGER_WINDOW } from './settings';
import { isSweep } from './sweep';
import { dealingRange, isMidRange, swings } from './swings';

// The three-gate entry at `level` (`side`: 'support' or 'resistance', as in
// sweep.js) found between bars `from` and `i`, or null without one. Returns
// { direction, sweepIndex, triggerIndex, entry, stop }.
export function threeGateEntry(bars, level, side, from, i) {
  const long = side === 'support';
  const clOk = (cl) => (long ? atLeast(cl, REJECTION_CL_MIN) : atMost(cl, REJECTION_CL_MIN));
  // Beyond with float tolerance, negating atMost/atLeast the way sweep.js
  // does for the same "beyond" idea.
  const tradesBeyond = (bar, edge) => (long ? !atMost(bar.h, edge) : !atLeast(bar.l, edge));

  for (let k = from; k <= i; k++) {
    if (!isSweep(bars, level, side, k)) continue;

    const cl = closeLocation(bars[k]);
    if (cl === null || !clOk(cl)) continue;

    const range = atr(bars, k);
    if (range === null) continue;

    const dr = dealingRange(swings(bars, k, SWING_K));
    if (dr && isMidRange(level, dr)) continue;

    const entry = long ? bars[k].h : bars[k].l;
    const last = Math.min(k + TRIGGER_WINDOW, i);
    for (let m = k + 1; m <= last; m++) {
      if (!tradesBeyond(bars[m], entry)) continue;
      const stop = long ? bars[k].l - STOP_BUFFER * range : bars[k].h + STOP_BUFFER * range;
      return { direction: long ? 'long' : 'short', sweepIndex: k, triggerIndex: m, entry, stop };
    }
  }
  return null;
}
