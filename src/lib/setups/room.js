// The 1m confidence check of setup 3.1: whether price has room to reach the
// 1m outer band in the trade direction. `bars` are 1m bars, oldest first;
// nothing after `k` is read.

import { bollinger } from './bollinger';
import { atLeast } from './compare';
import { atr } from './relative';
import { ROOM_MIN } from './settings';

const MINUTE = 60_000;

// The index of the last bar that had closed by `time` (ms), or -1. Bars are
// `minutes` long and `t` is their start.
export function lastClosedBy(bars, time, minutes = 1) {
  let last = -1;
  for (let k = 0; k < bars.length && Date.parse(bars[k].t) + minutes * MINUTE <= time; k++) last = k;
  return last;
}

// From `price` (the entry candle's close) to the 1m upper band for a long, or
// down to the lower band for a short, against ROOM_MIN times the 1m ATR, all
// as of 1m bar `k`. A price already past the band has negative room. Returns
// { distance, needed, ok }, or null without enough bars.
export function roomToBand(bars, k, bias, price, { min = ROOM_MIN } = {}) {
  const bands = bollinger(bars, k);
  const range = atr(bars, k);
  if (!bands || range === null) return null;
  const distance = bias === 'long' ? bands.upper - price : price - bands.lower;
  const needed = min * range;
  return { distance, needed, ok: atLeast(distance, needed) };
}
