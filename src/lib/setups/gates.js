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

// Window OK: the entry wasn't inside a lockout window.
export function windowGate(openedAt) {
  const minutes = minutesOfDay(openedAt);
  const locked = LOCKOUTS.some(([from, to]) => minutes >= toMinutes(from) && minutes < toMinutes(to));
  return locked ? MISSED : MET;
}

// Size OK: contracts within the planned range.
export function sizeGate(contracts) {
  return contracts >= SIZE_MIN && contracts <= SIZE_MAX ? MET : MISSED;
}

// Target OK: the day's fib extensions were recorded, so there was a target
// before the entry. No plan for the day means they weren't.
export function targetGate(dailyPlan) {
  return dailyPlan ? MET : MISSED;
}

// State OK: calm and uncompromised. setups.md asks for calm and rested, not
// bored, anxious, or revenge trading; of those only calm is a journal emotion
// and revenge trading a mistake tag, so the gate reads those two.
export function stateGate(entry) {
  if (!entry?.emotion) return UNKNOWN;
  if (entry.emotion !== 'calm') return MISSED;
  return entry.mistakes?.includes('revenge_trade') ? MISSED : MET;
}
