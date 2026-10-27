// The four-touch breakout and breakdown of setups.md 3.2: a trendline touched
// three times, broken by a close through it on the 4th approach. Bars use
// Alpaca's keys, oldest first; nothing after `i` is read.

import { isDisplacement } from './displacement';
import { DISP_4X, DISP_4X_LOOKBACK, TRENDLINE_K } from './settings';
import { swings } from './swings';
import { breakOutcome, closesInside, isAway, isUnbroken, lineThrough, lineTouches, reachesLine } from './trendline';

const KINDS = [
  { kind: '4xBD', side: 'support', pivot: 'low' },
  { kind: '4xBO', side: 'resistance', pivot: 'high' },
];

// The break of `line` on its 4th approach, as of bar `i`, or null (setups.md
// 2.7 and 3.2). Three touches establish the line, with no close through it in
// between, and the line must have been drawable by the break: its second
// swing point confirmed TRENDLINE_K bars after it. Closing through is checked
// before moving away, so a bar that does both is the break. Returns
// { touches, breakIndex }; the 4th entry of touches is the first bar of the
// 4th approach, which need not be a touch: it can be the break itself.
function breakOnFourthApproach(bars, line, side, first, second, i) {
  const touches = lineTouches(bars, line, side, first.index, i);
  if (touches.length < 3) return null;
  const third = touches[2];
  if (!isUnbroken(bars, line, side, touches[0], third)) return null;

  // The 3rd approach lasts until a bar moves away. A close through before
  // then breaks on the 3rd approach, which doesn't count.
  let k = third + 1;
  for (; k <= i; k++) {
    if (!closesInside(bars, line, side, k)) return null;
    if (isAway(bars, line, side, k)) break;
  }
  // The 4th approach starts at the first bar after the one that moved away
  // (hence k + 1) that reaches the line. If price never moved away, or never
  // came back, k ends past i and nothing is found.
  for (k += 1; k <= i; k++) if (reachesLine(bars, line, side, k)) break;
  const start = k;

  // It lasts until a later bar moves away, its first close through being the
  // break. As with touches, the first bar moving away doesn't end the
  // approach it starts.

  for (; k <= i; k++) {
    if (!closesInside(bars, line, side, k)) {
      if (second.index + TRENDLINE_K > k) return null;
      return { touches: [...touches.slice(0, 3), start], breakIndex: k };
    }
    if (k > start && isAway(bars, line, side, k)) return null;
  }
  return null;
}

// The trade a trap offers the other way: in on the reclaim close, stopped
// beyond the false break's extreme.
function trapTrade(bars, side, breakIndex, reclaimedAt) {
  const span = bars.slice(breakIndex, reclaimedAt + 1);
  return side === 'support'
    ? { side: 'long', entry: bars[reclaimedAt].c, stop: Math.min(...span.map((bar) => bar.l)) }
    : { side: 'short', entry: bars[reclaimedAt].c, stop: Math.max(...span.map((bar) => bar.h)) };
}

// The four-touch breaks as of bar `i`, oldest first. Each is { kind ('4xBO' up
// through resistance, '4xBD' down through support), line, touches (three,
// then the first bar of the 4th approach), breakIndex, displacement, outcome,
// status, trade }. Status: 'trap' when the
// break was reclaimed (with `trade`, the other way); 'weak' when the break bar
// lacked a body DISP_4X times the DISP_4X_LOOKBACK bars before it; 'valid'
// when it had one and the break was confirmed; 'pending' otherwise. Lines
// through different pairs of swing points can find the same break; each is
// reported once, with the line through the earliest pair.
export function fourTouchBreaks(bars, i) {
  const pivots = swings(bars, i, TRENDLINE_K);
  const found = new Map();
  for (const { kind, side, pivot } of KINDS) {
    const points = pivots.filter((s) => s.kind === pivot);
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        const line = lineThrough(points[a], points[b]);
        const hit = breakOnFourthApproach(bars, line, side, points[a], points[b], i);
        if (!hit || found.has(`${kind}:${hit.breakIndex}`)) continue;

        const displacement = isDisplacement(bars, hit.breakIndex, {
          multiple: DISP_4X,
          lookback: DISP_4X_LOOKBACK,
          bodyShare: 0,
        });
        const outcome = breakOutcome(bars, line, side, hit.breakIndex, i);
        let status = 'pending';
        if (outcome.status === 'reclaimed') status = 'trap';
        else if (!displacement) status = 'weak';
        else if (outcome.status === 'confirmed') status = 'valid';
        const trade = status === 'trap' ? trapTrade(bars, side, hit.breakIndex, outcome.reclaimedAt) : null;
        found.set(`${kind}:${hit.breakIndex}`, { kind, line, ...hit, displacement, outcome, status, trade });
      }
    }
  }
  return [...found.values()].sort((x, y) => x.breakIndex - y.breakIndex);
}
