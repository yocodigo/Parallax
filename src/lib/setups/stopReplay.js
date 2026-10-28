// The stop rules of setups.md section 5, replayed on SPY 1m bars after an
// entry, to compare them. Bars use Alpaca's keys (`t` is a bar's start),
// oldest first, and should cover the entry's trading day; earlier days give
// the 5m bands their history.

import { bollinger } from './bollinger';
import { atLeast, atMost } from './compare';
import { resample } from './resample';
import { tradingDay } from './session';
import { TIME_STOP } from './settings';

const MINUTE = 60_000;
const endOf = (bar, minutes) => Date.parse(bar.t) + minutes * MINUTE;

// Replays one trade entered at the close of 1m bar `entryIndex` (the fill
// bar), `bias` 'long' or 'short', under `rules`, any of:
// - 'S1': a 5m close back across the 5m middle band;
// - 'S2': a 1m close beyond the fill bar's far extreme (its low for a long);
// - 'S3': T1 not reached within TIME_STOP minutes of the entry.
// Bar by bar, T1 (when given) is checked first, by the bar's high (low for a
// short), since it was reached before that bar's close; then the rules, the
// first to trigger exiting at that close. With nothing triggered, the trade
// exits at the session's last close. R is in units of the distance from the
// entry to the fill bar's far extreme (S2's stop). Returns { exitIndex,
// exitPrice, reason ('t1', a rule, or 'close'), r, t1Later (a stop exit
// followed by T1 the same day) }.
export function replayStops({ bars, entryIndex, bias, t1 = null, rules }) {
  const long = bias === 'long';
  const fill = bars[entryIndex];
  const entry = fill.c;
  const stopLevel = long ? fill.l : fill.h;
  const risk = long ? entry - stopLevel : stopLevel - entry;
  const day = tradingDay(fill);
  const reachesT1 = (bar) => t1 !== null && (long ? atLeast(bar.h, t1) : atMost(bar.l, t1));

  // 5m bars for S1, each checked once its close is known; the first to check
  // closes after the entry. One that closed in a gap in the feed (no trade in
  // its last minute) closed before the next bar began, so it is checked before
  // anything on that bar, and an exit on it points to the last bar before the
  // gap. If the day's last 5m bar lacks its final minute, no later bar that
  // day checks it, and the trade exits at the close.
  const fives = resample(bars, 5);
  let nextFive = fives.findIndex((bar) => endOf(bar, 5) > endOf(fill, 1));
  if (nextFive < 0) nextFive = fives.length;
  const backAcrossMiddle = (j) => {
    const bands = bollinger(fives, j);
    if (!bands) return false;
    return long ? !atLeast(fives[j].c, bands.middle) : !atMost(fives[j].c, bands.middle);
  };

  const exit = (k, price, reason) => {
    const r = risk > 0 ? (long ? price - entry : entry - price) / risk : null;
    let t1Later = false;
    if (reason !== 't1' && reason !== 'close') {
      for (let m = k + 1; m < bars.length && tradingDay(bars[m]) === day; m++) {
        if (reachesT1(bars[m])) t1Later = true;
      }
    }
    return { exitIndex: k, exitPrice: price, reason, r, t1Later };
  };

  let k = entryIndex + 1;
  // Checks the 5m bars that closed by `time`, exiting on the first to cross
  // back at its close, pointing to bar `index`.
  const s1By = (time, index) => {
    while (nextFive < fives.length && endOf(fives[nextFive], 5) <= time) {
      const j = nextFive++;
      if (rules.includes('S1') && backAcrossMiddle(j)) return exit(index, fives[j].c, 'S1');
    }
    return null;
  };

  for (; k < bars.length && tradingDay(bars[k]) === day; k++) {
    const bar = bars[k];
    // Without a gap this finds nothing: the previous bar checked up to here.
    const inGap = s1By(Date.parse(bar.t), k - 1);
    if (inGap) return inGap;
    if (reachesT1(bar)) return exit(k, t1, 't1');
    if (rules.includes('S2') && (long ? !atLeast(bar.c, stopLevel) : !atMost(bar.c, stopLevel))) {
      return exit(k, bar.c, 'S2');
    }
    const withBar = s1By(endOf(bar, 1), k);
    if (withBar) return withBar;
    // Comparing start times fires at the close of the bar ending TIME_STOP
    // minutes after the entry, which is the fill bar's close.
    if (rules.includes('S3') && t1 !== null && Date.parse(bar.t) >= Date.parse(fill.t) + TIME_STOP * MINUTE) {
      return exit(k, bar.c, 'S3');
    }
  }
  return exit(k - 1, bars[k - 1].c, 'close');
}
