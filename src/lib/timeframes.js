// Single source of truth for which timeframes exist and how far back each
// may be requested. Caps are chosen so no request approaches Alpaca's
// 10,000-bar-per-response limit, so results never silently truncate.
//
// maxDays is derived from bar density:
//   ~390 one-minute bars per trading day, ~7 hourly, ~252 daily per year.
// Each cap keeps a single symbol comfortably under ~2,000 bars.
export const TIMEFRAMES = [
  { value: '1Min', label: '1 minute', group: 'Minutes', maxDays: 5 },
  { value: '5Min', label: '5 minutes', group: 'Minutes', maxDays: 30 },
  { value: '15Min', label: '15 minutes', group: 'Minutes', maxDays: 90 },
  { value: '30Min', label: '30 minutes', group: 'Minutes', maxDays: 180 },
  { value: '1Hour', label: '1 hour', group: 'Hours', maxDays: 365 },
  { value: '1Day', label: 'Daily', group: 'Daily', maxDays: 1825 },
  { value: '1Week', label: 'Weekly', group: 'Weekly', maxDays: 1825 },
  { value: '1Month', label: 'Monthly', group: 'Monthly', maxDays: 1825 },
];

// All selectable window lengths, in days. The UI shows only those that fit
// the chosen timeframe's cap.
export const WINDOWS = [
  { days: 1, label: '1 day' },
  { days: 5, label: '5 days' },
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
  { days: 730, label: '2 years' },
  { days: 1825, label: '5 years' },
];

const BY_VALUE = new Map(TIMEFRAMES.map((t) => [t.value, t]));

export function getTimeframe(value) {
  return BY_VALUE.get(value) || null;
}

// The maximum window (in days) allowed for a timeframe, or null if unknown.
export function maxDaysFor(value) {
  return BY_VALUE.get(value)?.maxDays ?? null;
}

// Windows valid for a given timeframe: those within its cap, always keeping
// at least the smallest option.
export function windowsFor(value) {
  const cap = maxDaysFor(value);
  if (cap == null) return WINDOWS;
  const fit = WINDOWS.filter((w) => w.days <= cap);
  return fit.length ? fit : [WINDOWS[0]];
}

// True when a (timeframe, days) pair is a known timeframe within its cap.
export function isAllowed(value, days) {
  const cap = maxDaysFor(value);
  if (cap == null) return false;
  return Number.isInteger(days) && days >= 1 && days <= cap;
}

// The window to keep after switching timeframes: the current one if the new
// timeframe offers it, otherwise the largest window that fits.
export function clampWindow(value, days) {
  const allowed = windowsFor(value);
  return allowed.some((w) => w.days === days)
    ? days
    : allowed[allowed.length - 1].days;
}