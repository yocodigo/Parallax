// Sweep (setups.md 2.8): a bar trades beyond a level and closes back on its
// original side. Never invalidation — only a close through breaks the level.

import { atLeast, atMost } from './compare';

export function isSweep(bars, level, side, k) {
  const bar = bars[k];
  // "Beyond" is the far side of the tolerance band atLeast/atMost already
  // allow for a price sitting on the level, so a wick within floating-point
  // error of it doesn't count as trading past it.
  const beyond = side === 'support' ? !atLeast(bar.l, level) : !atMost(bar.h, level);
  if (!beyond) return false;
  return side === 'support' ? atLeast(bar.c, level) : atMost(bar.c, level);
}
