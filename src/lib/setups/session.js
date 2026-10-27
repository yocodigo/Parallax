// Which bars count as trading hours. Bars use Alpaca's keys, `t` being the
// bar's start time.

import { minutesSinceOpen } from '@/lib/context/indicators';
import { EXTENDED_HOURS } from './settings';

// The bars in the regular session, or all of them with extended hours on.
// Filter minute bars before resampling them, so the day's last 15m bar holds
// no after-hours minutes.
export function sessionBars(bars, { extendedHours = EXTENDED_HOURS } = {}) {
  if (extendedHours) return bars;
  return bars.filter((bar) => minutesSinceOpen(new Date(bar.t)) !== null);
}
