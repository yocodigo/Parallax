// [10] The calendar checks of the entry review. Both take a New York date as
// `YYYY-MM-DD` (what `tradingDay` gives) and read it from its parts, never
// with `new Date(string)`, which shifts a date a day west of UTC.

import { GANN_SEASONAL_DATES, PRESSURE_DATES, SEASONAL_WINDOW } from './settings';

const DAY = 24 * 60 * 60 * 1000;

// True when the day of the month is inside one of the pressure ranges.
export function isPressureDate(day) {
  const dayOfMonth = Number(day.slice(8, 10));
  return PRESSURE_DATES.some(([from, to]) => dayOfMonth >= from && dayOfMonth <= to);
}

// The Gann seasonal date (`MM-DD`) within SEASONAL_WINDOW days of `day`, or
// null. Measured against the same year's dates; none is within a window of
// New Year, so none needs the neighbouring years.
export function seasonalDate(day) {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const time = Date.UTC(year, month - 1, dayOfMonth);
  return (
    GANN_SEASONAL_DATES.find((date) => {
      const [m, d] = date.split('-').map(Number);
      return Math.abs(Date.UTC(year, m - 1, d) - time) <= SEASONAL_WINDOW * DAY;
    }) ?? null
  );
}
