// Sweep (setups.md 2.8): a bar trades beyond a level and closes back on its
// original side. Never invalidation — only a close through breaks the level.

import { atLeast, atMost } from './compare';

export function isSweep(bars, level, side, k) {
  const bar = bars[k];
  const beyond = side === 'support' ? bar.l < level : bar.h > level;
  if (!beyond) return false;
  return side === 'support' ? atLeast(bar.c, level) : atMost(bar.c, level);
}
