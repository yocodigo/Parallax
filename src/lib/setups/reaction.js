// SPY's 1m reaction at a target level, T1 in setups.md 3.1 step 5. Bars use
// Alpaca's keys, oldest first; nothing after `i` is read. `bias` is the trade
// direction, so a long's target is above and price reaches it from below.

import { atLeast, atMost } from './compare';
import { isDisplacement } from './displacement';
import { atr } from './relative';
import { OSC_BARS, REJECT_BARS, REJECT_DIST, RIP_BARS, TOL } from './settings';

// The reaction to `level` as of bar `i`, looking from bar `from`: null until a
// bar reaches within TOL of it. From that touch, bar by bar, the first rule
// met decides (the user's choice), as it would live:
// - 'rejected': a close REJECT_DIST ATRs back, from the touch bar through the
//   next REJECT_BARS bars;
// - 'ripped': a displacement close beyond the level, with no close back in the
//   RIP_BARS bars after it;
// - 'oscillating': the second time closes switch sides of the level within
//   OSC_BARS bars of the touch (closes on the level don't count), 'drifting'
//   when the latest close is beyond the level and past the touch bar's close.
// A close that is both a rejection and the second switch is a rejection.
// 'none' once the OSC_BARS bars pass with nothing met and no rip pending;
// kind null while still undecided. Returns { kind, touchIndex, decidedAt,
// drifting (oscillating only) }.
export function reactionAt(bars, level, bias, from, i) {
  const long = bias === 'long';
  let touch = -1;
  for (let k = from; k <= i && touch < 0; k++) {
    const range = atr(bars, k);
    if (range === null) continue;
    const reaches = long ? atLeast(bars[k].h, level - TOL * range) : atMost(bars[k].l, level + TOL * range);
    if (reaches) touch = k;
  }
  if (touch < 0) return null;

  // Which side of the level a close is on: 1 beyond it (the trade's way), -1
  // back, 0 on it. The compare helpers count a close within rounding error of
  // the level as on it, so 1 and -1 mean clearly past it.
  const side = (k) => {
    const c = bars[k].c;
    if (long ? !atMost(c, level) : !atLeast(c, level)) return 1;
    if (long ? !atLeast(c, level) : !atMost(c, level)) return -1;
    return 0;
  };
  const decided = (kind, k, extra) => ({ kind, touchIndex: touch, decidedAt: k, ...extra });
  // The oscillation window's last bar: the touch is the first of its OSC_BARS.
  const last = touch + OSC_BARS - 1;
  let switches = 0;
  let lastSide = 0;
  let rip = null;

  for (let k = touch; k <= i; k++) {
    const c = bars[k].c;
    // ATR through bar k, as in the other detectors, so a wide rejection bar
    // raises its own threshold slightly.
    const rejectAt = REJECT_DIST * atr(bars, k);
    if (k <= touch + REJECT_BARS && (long ? atMost(c, level - rejectAt) : atLeast(c, level + rejectAt))) {
      return decided('rejected', k);
    }

    if (rip !== null && side(k) !== 1) rip = null;
    else if (rip !== null && k === rip + RIP_BARS) return decided('ripped', k);

    if (k <= last) {
      const s = side(k);
      if (s !== 0) {
        if (lastSide !== 0 && s !== lastSide) switches += 1;
        lastSide = s;
      }
      if (switches >= 2) {
        const drifting = s === 1 && (long ? c > bars[touch].c : c < bars[touch].c);
        return decided('oscillating', k, { drifting });
      }
      if (rip === null && s === 1 && isDisplacement(bars, k)) rip = k;
    }

    if (k >= last && rip === null) return decided('none', k);
  }
  return { kind: null, touchIndex: touch };
}
