import { nyDay } from './setups/session';

// The date ranges the Performance Review can cover, as New York days (a trade
// is in a range by the day it closed): the last 7 or 30 days, counting today;
// all time; or a custom range of whole days, both ends included. A range's
// `key` names it in the saved reviews (the performance_reviews table).

const PRESET_DAYS = { '7d': 7, '30d': 30 };
const DAY_MS = 24 * 60 * 60 * 1000;

const nyHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' });

const asUtc = (day) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
};

const addDays = (day, days) => new Date(asUtc(day).getTime() + days * DAY_MS).toISOString().slice(0, 10);

// The instant a 'YYYY-MM-DD' New York day begins. Midnight is 04:00Z in daylight
// time and 05:00Z in standard time, so it is whichever of the two reads as
// midnight in New York on that day (clocks change at 2am, never at midnight).
export function nyMidnight(day) {
  const start = asUtc(day).getTime();
  const instants = [4, 5].map((hours) => new Date(start + hours * 60 * 60 * 1000));
  return instants.find((at) => nyDay(at) === day && Number(nyHour.format(at)) === 0);
}

// A real calendar date in 'YYYY-MM-DD' form, not '2026-02-30' or '04/01/2026'.
const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && asUtc(value).toISOString().slice(0, 10) === value;

const range = (key, label, fromDay, toDay) => ({
  ok: true,
  key,
  label,
  fromDay,
  toDay,
  from: fromDay && nyMidnight(fromDay),
  to: toDay && nyMidnight(addDays(toDay, 1)),
});

// `query` is { range: '7d' | '30d' | 'all' | 'custom', from, to } (the dates for
// a custom range only). Returns { ok: true, key, label, fromDay, toDay, from,
// to } with `from` and `to` the instants bounding closing times, [from, to), or
// null on an open side; or { ok: false, error }.
export function parseReviewRange({ range: kind, from, to }, now = new Date()) {
  if (Object.hasOwn(PRESET_DAYS, kind)) {
    const days = PRESET_DAYS[kind];
    const today = nyDay(now);
    return range(kind, `Last ${days} days`, addDays(today, 1 - days), today);
  }
  if (kind === 'all') return range('all', 'All time', null, null);
  if (kind === 'custom') {
    if (!isDay(from) || !isDay(to)) return { ok: false, error: 'A custom range needs a from and a to date (YYYY-MM-DD)' };
    if (from > to) return { ok: false, error: 'The from date is after the to date' };
    return range(`custom:${from}:${to}`, `${from} to ${to}`, from, to);
  }
  return { ok: false, error: 'Range must be 7d, 30d, all, or custom' };
}
