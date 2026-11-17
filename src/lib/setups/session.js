// Which bars count as trading hours. Bars use Alpaca's keys, `t` being the
// bar's start time.

import { minutesSinceOpen } from '@/lib/context/indicators';
import { EXTENDED_HOURS } from './settings';

// The New York trading date of a bar. The en-CA locale formats it as
// YYYY-MM-DD, so two days compare as plain strings.
const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
export const tradingDay = (bar) => nyDate.format(new Date(bar.t));
// The same for a Date.
export const nyDay = (date) => nyDate.format(date);

// The bars in the regular session, or all of them with extended hours on.
// Filter minute bars before resampling them, so the day's last 15m bar holds
// no after-hours minutes.
export function sessionBars(bars, { extendedHours = EXTENDED_HOURS } = {}) {
  if (extendedHours) return bars;
  // minutesSinceOpen is null outside 9:30 to 16:00 New York, and 0 at 9:30,
  // hence !== null rather than a truthiness check.
  return bars.filter((bar) => minutesSinceOpen(new Date(bar.t)) !== null);
}

// The bars from the start of `day`, a trailing slice: they are chronological
// and resampling with `asOf` the fill has already dropped everything that
// hadn't closed. So the last bar left is the last one that closed before the
// entry, and the slice is empty when none had closed yet that session.
//
// The entry candle, the bar before it, and the swings all stop at the
// overnight gap, the way findEntry stops a bias there. Comparing the
// session's first 5m bar against the previous afternoon's last one would
// measure a seventeen-hour gap as a clean break.
export function sessionOf(bars, day) {
  const start = bars.findIndex((bar) => tradingDay(bar) === day);
  return start < 0 ? [] : bars.slice(start);
}
