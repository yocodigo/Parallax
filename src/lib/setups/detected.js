// [rules-v3 6] The detected setup: every detector run on the underlying's
// minute bars that closed before the fill, so a trade can be judged by the
// setup that was actually on the chart rather than the one it was planned
// under. Only setups the trade's way are kept. Each one says when it
// completed (the bar that finished it, by Alpaca's opening stamp) and how
// many bars of its own timeframe had closed since, so recency is a filter on
// the stored result rather than baked into it.
//
// Statuses: the band cross is complete with room to the 1m band, else
// no_room; a four-touch break keeps its own (valid, weak, trap, pending); a
// reversal sequence is complete until a close beyond the sweep extreme
// invalidates it or price reaches its target; a three-gate entry is complete
// once triggered. Only the four-touch break has a grade.

import { findEntry } from './entry';
import { sideOf } from './entryReview';
import { fourTouchBreaks } from './fourTouch';
import { tradeBias } from './replayTrades';
import { resample } from './resample';
import { reversalSequences } from './reversalSequence';
import { roomToBand } from './room';
import { sessionBars, sessionOf, tradingDay } from './session';
import { DETECTED_MAX_BARS, N_RECLAIM } from './settings';
import { threeGateEntry } from './threeGateEntry';
import { crossIndex } from './tradeGates';

const MINUTE = 60_000;

const found = (detector, timeframe, direction, candles, index, { status, grade = null, ...rest }) => ({
  detector,
  timeframe,
  direction,
  status,
  grade,
  completedAt: candles[index].t,
  barsSince: candles.length - 1 - index,
  ...rest,
});

// 3.1: the first 5m entry candle after the session's newest 15m cross, with
// the 1m room to the outer band measured from its close as that candle closed.
function bandCrossOn(bars15, bars5, bars1, day, bias) {
  const cross = crossIndex(bars15, day);
  if (cross === null) return null;
  const entry = findEntry(bars15, bars5, cross);
  if (!entry || entry.bias !== bias) return null;
  const candle = bars5[entry.index];
  const closesAt = Date.parse(candle.t) + 5 * MINUTE;
  const k = bars1.findLastIndex((bar) => Date.parse(bar.t) + MINUTE <= closesAt);
  // No room when it can't be measured either: too few 1m bars for the band.
  const room = k < 0 ? null : roomToBand(bars1, k, bias, candle.c);
  return found('band_cross', '5m', bias, bars5, entry.index, { status: room?.ok ? 'complete' : 'no_room' });
}

// The bar a four-touch break reached its status on: the reclaim for a trap,
// the end of the reclaim window for a confirmed break, else the break bar.
function fourTouchCompletion({ breakIndex, outcome }) {
  if (outcome.status === 'reclaimed') return outcome.reclaimedAt;
  if (outcome.status === 'confirmed') return Math.max(outcome.acceptedAt, breakIndex + N_RECLAIM);
  return breakIndex;
}

// 3.2: the latest break offering a trade the trade's way.
function fourTouchOn(candles, timeframe, bias) {
  if (candles.length === 0) return null;
  const line = fourTouchBreaks(candles, candles.length - 1)
    .filter((b) => sideOf(b) === bias)
    .at(-1);
  if (!line) return null;
  return found('four_touch', timeframe, bias, candles, fourTouchCompletion(line), {
    status: line.status,
    grade: line.grade.grade,
  });
}

// 3.3: the latest sequence the trade's way. It completes on the bar after the
// displacement (the gap needs it) or at the MSS, whichever is later, and
// stays live until T1 or a close beyond the sweep extreme.
function reversalOn(candles, timeframe, bias) {
  if (candles.length === 0) return null;
  const i = candles.length - 1;
  const completion = (s) => Math.max(s.mssIndex, s.displacementIndex + 1);
  const sequence = reversalSequences(candles, i)
    .filter((s) => s.direction === bias)
    .reduce((latest, s) => (!latest || completion(s) >= completion(latest) ? s : latest), null);
  if (!sequence) return null;

  const long = bias === 'long';
  const sweep = candles[sequence.sweepIndex];
  let status = 'complete';
  for (let k = completion(sequence) + 1; k <= i; k++) {
    const bar = candles[k];
    if (long ? bar.c < sweep.l : bar.c > sweep.h) {
      status = 'invalidated';
      break;
    }
    if (long ? bar.h >= sequence.target : bar.l <= sequence.target) {
      status = 'target_hit';
      break;
    }
  }
  return found('reversal', timeframe, bias, candles, completion(sequence), { status });
}

// 3.4: the latest trigger at a flat tier 1 or 2 level, read from the bar the
// level existed by (the session's own levels form during it).
function threeGateOn(candles, timeframe, bias, levels) {
  if (candles.length === 0) return null;
  const i = candles.length - 1;
  const side = bias === 'long' ? 'support' : 'resistance';
  let best = null;
  for (const level of levels) {
    if (level.tier > 2 || level.slope !== undefined) continue;
    const from = level.formedAt ? candles.findIndex((bar) => bar.t > level.formedAt) : 0;
    if (from < 0) continue;
    const entry = threeGateEntry(candles, level.price, side, from, i);
    if (entry && entry.direction === bias && (!best || entry.triggerIndex > best.entry.triggerIndex)) {
      best = { entry, level };
    }
  }
  if (!best) return null;
  return found('three_gate', timeframe, bias, candles, best.entry.triggerIndex, {
    status: 'complete',
    level: { kind: best.level.kind, price: best.level.price },
  });
}

// The setups the trade's way on `bars` (the underlying's minute bars around
// the entry, reaching back a session for the 15m bands) as of the fill, from
// `levels` (levelMap's, for the three-gate entry). Band cross on the 5m; the
// others on the session's 1m and 5m bars each. Empty for a plan never entered.
export function detectSetups(trade, bars = [], { levels = [] } = {}) {
  if (!trade.openedAt || bars.length === 0) return [];
  const asOf = trade.openedAt;
  const day = tradingDay({ t: asOf.toISOString() });
  const bias = tradeBias(trade);
  if (bias !== 'long' && bias !== 'short') return [];

  const regular = sessionBars(bars);
  const bars15 = resample(regular, 15, { asOf });
  const all1 = resample(regular, 1, { asOf });
  const session = { '1m': sessionOf(all1, day), '5m': sessionOf(resample(regular, 5, { asOf }), day) };

  const setups = [bandCrossOn(bars15, session['5m'], all1, day, bias)];
  for (const timeframe of ['1m', '5m']) {
    const candles = session[timeframe];
    setups.push(
      fourTouchOn(candles, timeframe, bias),
      reversalOn(candles, timeframe, bias),
      threeGateOn(candles, timeframe, bias, levels)
    );
  }
  return setups.filter(Boolean);
}

// Whether a detected setup clears an entry window (rules-v3 5): recent enough
// to be the trade's own, and complete, or for a four-touch break valid and
// grade A.
export function clearsWindow(setup) {
  if (setup.barsSince > DETECTED_MAX_BARS) return false;
  if (setup.detector === 'four_touch') return setup.status === 'valid' && setup.grade === 'A';
  return setup.status === 'complete';
}
