import { overlap } from './candles';
import { atMost } from './compare';
import { bandCross } from './direction';
import { LOCKOUTS, OVERLAP_MAX, SIZE_MAX, SIZE_MIN } from './settings';
import { isMidRange } from './swings';

// [8] The pre-entry gates, graded after the fact: the app is never used while
// a trade is on, so each gate asks whether the rule held at the entry, from
// what was recorded or what the bars before it show.
//
// 'unknown' is not a failure. It means the gate can't be judged, because
// nothing recorded what it needs. Keeping it apart from 'missed' stops a gap
// in the journal from reading as broken discipline.
export const MET = 'met';
export const MISSED = 'missed';
export const UNKNOWN = 'unknown';

// Wall-clock minutes, not context/indicators.js's minutesSinceOpen: the
// lockout windows are clock times and two of them need judging outside the
// regular session, where that helper gives null.
const nyTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const minutesOfDay = (date) => {
  const parts = Object.fromEntries(nyTime.formatToParts(date).map(({ type, value }) => [type, value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
};

const toMinutes = (time) => {
  const [hour, minute] = time.split(':');
  return Number(hour) * 60 + Number(minute);
};

// Window OK: the entry wasn't inside a lockout window. A plan that was never
// entered has no time to judge, and an unentered plan broke no rule.
export function windowGate(openedAt) {
  if (!openedAt) return UNKNOWN;
  const minutes = minutesOfDay(openedAt);
  const locked = LOCKOUTS.some(([from, to]) => minutes >= toMinutes(from) && minutes < toMinutes(to));
  return locked ? MISSED : MET;
}

// Size OK: contracts within the planned range.
export function sizeGate(contracts) {
  if (contracts == null) return UNKNOWN;
  return contracts >= SIZE_MIN && contracts <= SIZE_MAX ? MET : MISSED;
}

// Target OK: the day's fib extensions were recorded, so there was a target
// before the entry. A daily_plans row always carries its LTF levels (both
// columns are NOT NULL), so having the row is having the levels.
export function targetGate(dailyPlan) {
  return dailyPlan ? MET : MISSED;
}

// State OK, read from the trade's plan entry, where section 9.1 puts the state
// before entering. setups.md asks for calm and rested, not bored, anxious, or
// revenge trading. Of those the journal records only the 'calm' emotion and
// the 'revenge_trade' mistake (both from journalEntry.js); rested has no
// field, and emotional_control belongs to review entries, written after the
// fact, so it is no pre-entry signal.
export function stateGate(planEntry) {
  if (!planEntry?.emotion) return UNKNOWN;
  if (planEntry.emotion !== 'calm') return MISSED;
  return planEntry.mistakes?.includes('revenge_trade') ? MISSED : MET;
}

// Direction OK: the 15m bar that set the bias closed on the trade's side of
// the middle band (section 3.1's cross). `bars15` are 15m bars, oldest first;
// `i` is that bar's index. Unknown without 20 bars ending at `i` for the
// bands, or a trade with no recorded direction.
export function directionGate(bars15, i, direction) {
  if (direction !== 'long' && direction !== 'short') return UNKNOWN;
  const cross = bandCross(bars15, i);
  if (!cross) return UNKNOWN;
  return cross.bias === direction ? MET : MISSED;
}

// Entry OK: the 5m entry candle's overlap with the bar before it was at most
// OVERLAP_MAX. Unknown without both bars, or when the entry candle has no
// range to measure the overlap share against.
export function entryGate(bar, prev) {
  if (!bar || !prev) return UNKNOWN;
  const share = overlap(bar, prev);
  if (share === null) return UNKNOWN;
  return atMost(share, OVERLAP_MAX) ? MET : MISSED;
}

// Location OK: the entry price wasn't in the middle of the dealing range
// (section 2.5). `range` is { low, high } from the swings at entry. Unknown
// without both a price and a range to judge it against.
export function locationGate(price, range) {
  if (price == null || !range) return UNKNOWN;
  return isMidRange(price, range) ? MISSED : MET;
}

// Stop OK: a stop rule (S1/S2/S3, section 5) was chosen before entry.
// Unknown, not missed, without one recorded: most plans so far predate the
// field, and the plan form doesn't require it yet.
export function stopGate(stopRule) {
  return stopRule ? MET : UNKNOWN;
}

// All of a trade's gates, keyed by name. Size OK is Joel's options rule (1-2
// contracts); a stock or crypto swing has no contract count to judge by it,
// so the gate is left off rather than graded against every trade.
export function gradeGates({
  assetClass,
  openedAt,
  quantity,
  direction,
  entryPrice,
  stopRule,
  dailyPlan,
  planEntry,
  bars15,
  directionBarIndex,
  entryBar,
  entryPrevBar,
  dealingRange,
}) {
  const gates = {
    window: windowGate(openedAt),
    direction: directionGate(bars15, directionBarIndex, direction),
    entry: entryGate(entryBar, entryPrevBar),
    location: locationGate(entryPrice, dealingRange),
    target: targetGate(dailyPlan),
    state: stateGate(planEntry),
    stop: stopGate(stopRule),
  };
  if (assetClass === 'option') gates.size = sizeGate(quantity);
  return gates;
}
