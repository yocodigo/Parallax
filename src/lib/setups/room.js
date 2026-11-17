// The 1m confidence check of setup 3.1: whether price has room to reach the
// 1m outer band in the trade direction. `bars` are 1m bars, oldest first;
// nothing after `k` is read.

import { bollinger } from './bollinger';
import { atLeast, atMost } from './compare';
import { atr } from './relative';
import { ROOM_MIN } from './settings';

const MINUTE = 60_000;

// The index of the last bar that had closed by `time` (ms), or -1. Bars are
// `minutes` long and `t` is their start.
export function lastClosedBy(bars, time, minutes = 1) {
  let last = -1;
  for (let k = 0; k < bars.length; k++) {
    // Oldest first, so the first bar still open at `time` ends the search.
    if (Date.parse(bars[k].t) + minutes * MINUTE > time) break;
    last = k;
  }
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

// [rules-v3 4] Room to the next level: from the entry `price` to the nearest
// level ahead in the trade's direction that the day hasn't traded at yet
// (levelMap's touchedToday; a touched one is used up), against the distance
// back to the `invalidation` level, the price where the trade is wrong.
// Returns { level ({ kind, price, tier } or null when nothing untouched lies
// ahead), points, risk, ratio }: points are always given with a level, risk
// only with an invalidation level on the losing side, and ratio (points over
// risk) only with both. Null without a direction or a price. No minimum is
// applied: one is to be set from the trades once enough have it.
export function levelRoom({ levels, price, bias, invalidation }) {
  if ((bias !== 'long' && bias !== 'short') || price == null) return null;
  const long = bias === 'long';
  const ahead = levels
    .filter((level) => !level.touchedToday && (long ? !atMost(level.price, price) : !atLeast(level.price, price)))
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
  const behind = invalidation != null && (long ? !atLeast(invalidation, price) : !atMost(invalidation, price));
  const risk = behind ? Math.abs(price - invalidation) : null;
  const next = ahead[0];
  if (!next) return { level: null, points: null, risk, ratio: null };
  const points = Math.abs(next.price - price);
  return {
    level: { kind: next.kind, price: next.price, tier: next.tier },
    points,
    risk,
    ratio: risk === null ? null : points / risk,
  };
}
