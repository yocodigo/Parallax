import { LOCKOUTS, SIZE_MAX, SIZE_MIN } from './settings';

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
