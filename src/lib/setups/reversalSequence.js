// Reversal sequence (setups.md 3.3): a pool swept, a displacement bar
// closing back beyond it within 2 bars, an MSS at that bar or within 2 more,
// and a fair value gap from that same bar giving the entry. Long version
// here (a sellside pool, equal lows); short mirrors it off a buyside pool.
// Bars are oldest first; nothing after `i` is read.

import { atLeast, atMost } from './compare';
import { isDisplacement } from './displacement';
import { fairValueGap } from './fvg';
import { pools } from './pools';
import { atr } from './relative';
import { STOP_BUFFER, SWING_K } from './settings';
import { isMSS } from './structure';
import { isSweep } from './sweep';
import { swings } from './swings';

// Long sweeps a sellside pool and targets the near edge of a buyside pool
// overhead; short mirrors every piece of it off a buyside pool.
const SIDES = [
  {
    direction: 'long',
    poolSide: 'support',
    mssKind: 'high',
    fvgSide: 'bullish',
    reclaimed: (bar, pool) => atLeast(bar.c, pool.high),
    targetSide: 'resistance',
    targetEdge: 'low',
    nearer: (candidate, best) => candidate < best,
  },
  {
    direction: 'short',
    poolSide: 'resistance',
    mssKind: 'low',
    fvgSide: 'bearish',
    reclaimed: (bar, pool) => atMost(bar.c, pool.low),
    targetSide: 'support',
    targetEdge: 'high',
    nearer: (candidate, best) => candidate > best,
  },
];

// The most recent swing of `kind` in `swingList` — setups.md 3.3's "last
// confirmed lower high", or its higher-low mirror. Null without one.
function lastSwingOf(swingList, kind) {
  let found = null;
  for (const swing of swingList) {
    if (swing.kind === kind && (!found || swing.index > found.index)) found = swing;
  }
  return found;
}

// The nearest pool on `side.targetSide` in `allPools`, ahead of `entry` in
// the trade direction — setups.md 3.3's "nearest buyside pool" (or its
// support-side mirror for a short). Null without one.
function nearestTarget(allPools, side, entry) {
  let found = null;
  for (const pool of allPools) {
    if (pool.side !== side.targetSide) continue;
    const edge = pool[side.targetEdge];
    const ahead = side.direction === 'long' ? edge > entry : edge < entry;
    if (ahead && (!found || side.nearer(edge, found[side.targetEdge]))) found = pool;
  }
  return found;
}

// The sequence `side` finds sweeping `pool`, as of bar `i`, or null without
// the full chain. The first sweep that completes the chain wins; a sweep
// that doesn't is just a sweep, not a failed sequence, so later sweeps of
// the same pool still get a chance. The pool itself must be confirmed
// (SWING_K bars past its last touch) by the sweep, same as any other swing
// point here — fourTouch.js's second.index + TRENDLINE_K check in
// breakOnFourthApproach guards the same lookahead.
function sequenceFor(bars, i, pool, side) {
  const level = side.poolSide === 'support' ? pool.low : pool.high;
  const confirmedAt = pool.touches.at(-1) + SWING_K;
  for (let sweepIndex = confirmedAt; sweepIndex <= i; sweepIndex++) {
    if (!isSweep(bars, level, side.poolSide, sweepIndex)) continue;

    let displacementIndex = null;
    for (let k = sweepIndex + 1; k <= Math.min(sweepIndex + 2, i); k++) {
      if (isDisplacement(bars, k) && side.reclaimed(bars[k], pool)) {
        displacementIndex = k;
        break;
      }
    }
    if (displacementIndex === null) continue;

    // The MSS line and the target pool can only use structure already
    // confirmed as of the sweep (the user's choice of anchor: a sequence is
    // judged by what was knowable when it triggered, not by hindsight from
    // `i`), so these are recomputed here rather than reusing the swings and
    // pools found as of `i`.
    const priorSwings = swings(bars, sweepIndex, SWING_K);
    const lastSwing = lastSwingOf(priorSwings, side.mssKind);
    if (!lastSwing) continue;
    let mssIndex = null;
    for (let k = displacementIndex; k <= Math.min(displacementIndex + 2, i); k++) {
      if (isMSS(bars, lastSwing, k)) {
        mssIndex = k;
        break;
      }
    }
    if (mssIndex === null) continue;
    if (displacementIndex + 1 > i) continue;

    const fvg = fairValueGap(bars, displacementIndex);
    if (!fvg || fvg.side !== side.fvgSide) continue;

    const range = atr(bars, sweepIndex);
    if (range === null) continue;
    const entry = fvg.ce;
    const stop =
      side.poolSide === 'support' ? bars[sweepIndex].l - STOP_BUFFER * range : bars[sweepIndex].h + STOP_BUFFER * range;

    const target = nearestTarget(pools(bars, priorSwings), side, entry);
    if (!target) continue;
    const t1 = target[side.targetEdge];
    const r = side.direction === 'long' ? (t1 - entry) / (entry - stop) : (entry - t1) / (stop - entry);

    return { direction: side.direction, pool, sweepIndex, displacementIndex, mssIndex, fvg, entry, stop, target: t1, r };
  }
  return null;
}

// The reversal sequences of setups.md 3.3 found as of bar `i`, oldest first.
// Each pool that gets swept and reclaimed, with structure and a fair value
// gap behind it and a pool ahead to target, is one sequence: { direction,
// pool, sweepIndex, displacementIndex, mssIndex, fvg, entry, stop, target,
// r }. `entry` is the fair value gap's CE, a limit order; this doesn't
// simulate when or whether it filled.
export function reversalSequences(bars, i) {
  const allPools = pools(bars, swings(bars, i, SWING_K));
  const found = [];
  for (const side of SIDES) {
    for (const pool of allPools.filter((p) => p.side === side.poolSide)) {
      const sequence = sequenceFor(bars, i, pool, side);
      if (sequence) found.push(sequence);
    }
  }
  return found.sort((a, b) => a.sweepIndex - b.sweepIndex);
}
