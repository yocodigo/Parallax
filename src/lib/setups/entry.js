// The 5m entry of setup 3.1, once the 15m bias is set. `bars` are 5m bars,
// oldest first; nothing after `j` is read.

import { hasLittleOverlap } from './candles';
import { bandCross } from './direction';

const MINUTE = 60_000;

// True when 5m bar `j` is an entry in the direction of `bias`: for a long, an
// up candle (close above open) whose high breaks above the previous bar's
// high, with little overlap against it; a short mirrors this. The break
// matters because a bar entirely below the previous one has no overlap
// either.
export function isEntryCandle(bars, j, bias) {
  if (j < 1 || (bias !== 'long' && bias !== 'short')) return false;
  const bar = bars[j];
  const prev = bars[j - 1];
  const moves = bias === 'long' ? bar.c > bar.o && bar.h > prev.h : bar.c < bar.o && bar.l < prev.l;
  return moves && hasLittleOverlap(bar, prev);
}

// More volume than the bar before grades an entry stronger; it isn't required.
export const risingVolume = (bars, j) => j >= 1 && bars[j].v > bars[j - 1].v;

// The 5m entry after the 15m bar `i` crossed the middle band: the first entry
// candle that starts once that 15m bar closed and closes while the bias still
// holds. A later 15m close with another bias (the other side, or on the band)
// ends the search, and a 5m candle closing at that same moment is too late.
// Returns { index, bias, risingVolume } into `bars5`, or null.
export function findEntry(bars15, bars5, i) {
  const cross = bandCross(bars15, i);
  if (!cross?.crossed) return null;
  // `t` is when a bar opens, so it closes `minutes` later.
  const closeOf = (bar, minutes) => Date.parse(bar.t) + minutes * MINUTE;

  const start = closeOf(bars15[i], 15);
  let end = Infinity;
  for (let m = i + 1; m < bars15.length; m++) {
    if (bandCross(bars15, m)?.bias !== cross.bias) {
      end = closeOf(bars15[m], 15);
      break;
    }
  }

  for (let j = 0; j < bars5.length; j++) {
    if (Date.parse(bars5[j].t) < start) continue;
    if (closeOf(bars5[j], 5) >= end) break;
    if (isEntryCandle(bars5, j, cross.bias)) return { index: j, bias: cross.bias, risingVolume: risingVolume(bars5, j) };
  }
  return null;
}
