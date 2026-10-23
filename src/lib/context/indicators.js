// Small market indicators for the context snapshot saved at entry.

const SESSION_MINUTES = 390;

const nyTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Average of the last `n` values, or null without enough of them.
export function sma(values, n) {
  if (values.length < n) return null;
  return values.slice(-n).reduce((sum, v) => sum + v, 0) / n;
}

// 'up' when price is above its 20-day average and that is above the 50-day,
// 'down' in the mirror case, 'sideways' otherwise. `closes` are daily closes
// before today, oldest first; `price` is where it traded at entry.
export function trendOf(closes, price) {
  const fast = sma(closes, 20);
  const slow = sma(closes, 50);
  if (fast === null || slow === null) return null;
  if (price > fast && fast > slow) return 'up';
  if (price < fast && fast < slow) return 'down';
  return 'sideways';
}

// Today's open against yesterday's close, in percent.
export const gapPercent = (open, previousClose) => ((open - previousClose) / previousClose) * 100;

// How much more the stock moved than the benchmark over the same span, in
// percentage points. Each is { from, to } prices.
export const relativeStrength = (stock, benchmark) =>
  ((stock.to / stock.from - 1) - (benchmark.to / benchmark.from - 1)) * 100;

// Minutes since the 9:30 AM New York open, or null outside the regular session.
export function minutesSinceOpen(date) {
  const parts = Object.fromEntries(nyTime.formatToParts(date).map(({ type, value }) => [type, value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute) - (9 * 60 + 30);
  return minutes >= 0 && minutes < SESSION_MINUTES ? minutes : null;
}

// Volume so far today against what an average day has traded by the same
// point, assuming volume spreads evenly over the session (a simplification:
// real volume is heavier at the open and close).
export function relativeVolume(volumeSoFar, averageDailyVolume, minutesIn) {
  if (minutesIn === null || !averageDailyVolume) return null;
  const expected = averageDailyVolume * (Math.max(minutesIn, 1) / SESSION_MINUTES);
  return volumeSoFar / expected;
}
