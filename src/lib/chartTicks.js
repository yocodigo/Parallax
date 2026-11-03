// X-axis ticks for charts plotted point by point (one point per trade), where
// the axis is the point's position rather than time: a tick sits on the first
// point of each New York day, or of each month once the points span more than
// about two months. Times are Dates or ISO strings.

const DAY_SPAN_LIMIT = 62 * 24 * 60 * 60 * 1000;

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

function nyDate(time) {
  const { year, month, day } = Object.fromEntries(
    parts.formatToParts(new Date(time)).map(({ type, value }) => [type, value])
  );
  return { year, month, day };
}

export function timeTicks(times) {
  if (times.length === 0) return [];
  const span = new Date(times.at(-1)).getTime() - new Date(times[0]).getTime();
  const byDay = span <= DAY_SPAN_LIMIT;
  const dates = times.map(nyDate);
  const multiYear = dates[0].year !== dates.at(-1).year;

  const ticks = [];
  let previous = null;
  dates.forEach(({ year, month, day }, index) => {
    const key = byDay ? `${year} ${month} ${day}` : `${year} ${month}`;
    if (key === previous) return;
    previous = key;
    // Over a long span, the year shows on the first tick and on each January.
    const withYear = !byDay && multiYear && (ticks.length === 0 || month === 'Jan');
    const label = byDay ? `${month} ${day}` : withYear ? `${month} ${year}` : month;
    ticks.push({ index, label });
  });
  return ticks;
}

// Y-axis ticks for a dollar scale: round steps (1, 2, 2.5, or 5 times a power
// of ten, never under a dollar) from the step below the lowest value to the one
// above the highest, always taking in zero. The smallest step that keeps to
// MAX_INTERVALS wins, so the plot wastes little room past the data.
const MAX_INTERVALS = 7;
const ROUND_STEPS = [1, 2, 2.5, 5];

export function valueTicks(min, max) {
  const lo = Math.min(0, min);
  // lo + 1: a curve flat at zero still gets a scale.
  const hi = Math.max(0, max, lo + 1);
  for (let power = Math.floor(Math.log10((hi - lo) / MAX_INTERVALS)); ; power += 1) {
    for (const multiple of ROUND_STEPS) {
      const step = multiple * 10 ** power;
      if (step < 1) continue;
      const first = Math.floor(lo / step);
      const last = Math.ceil(hi / step);
      if (last - first <= MAX_INTERVALS) {
        return Array.from({ length: last - first + 1 }, (_, i) => (first + i) * step);
      }
    }
  }
}
