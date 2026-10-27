// The 5m entry of setup 3.1, once the 15m bias is set. `bars` are 5m bars,
// oldest first; nothing after `j` is read.

import { hasLittleOverlap } from './candles';

// True when 5m bar `j` is an entry in the direction of `bias`: for a long, an
// up candle (close above open) whose high breaks above the previous bar's
// high, with little overlap against it; a short mirrors this. The break
// matters because a bar entirely below the previous one has no overlap
// either.
export function isEntryCandle(bars, j, bias) {
  if (j < 1 || !bias) return false;
  const bar = bars[j];
  const prev = bars[j - 1];
  const moves = bias === 'long' ? bar.c > bar.o && bar.h > prev.h : bar.c < bar.o && bar.l < prev.l;
  return moves && hasLittleOverlap(bar, prev);
}

// More volume than the bar before grades an entry stronger; it isn't required.
export const risingVolume = (bars, j) => j >= 1 && bars[j].v > bars[j - 1].v;
