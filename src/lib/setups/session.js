// Which bars count as trading hours. Bars use Alpaca's keys, `t` being the
// bar's start time.

import { minutesSinceOpen } from '@/lib/context/indicators';
import { EXTENDED_HOURS } from './settings';

// The New York trading date of a bar. The en-CA locale formats it as
// YYYY-MM-DD, so two days compare as plain strings.
const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
export const tradingDay = (bar) => nyDate.format(new Date(bar.t));

// The bars in the regular session, or all of them with extended hours on.
// Filter minute bars before resampling them, so the day's last 15m bar holds
// no after-hours minutes.
export function sessionBars(bars, { extendedHours = EXTENDED_HOURS } = {}) {
  if (extendedHours) return bars;
  // minutesSinceOpen is null outside 9:30 to 16:00 New York, and 0 at 9:30,
  // hence !== null rather than a truthiness check.
  return bars.filter((bar) => minutesSinceOpen(new Date(bar.t)) !== null);
}
