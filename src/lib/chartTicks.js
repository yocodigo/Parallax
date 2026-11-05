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
// of ten, never under a dollar) from the step at or below the lowest value to
// the one at or above the highest, always taking in zero. The smallest step that keeps to
// MAX_INTERVALS wins, so the plot wastes little room past the data.
const MAX_INTERVALS = 7;
const ROUND_STEPS = [1, 2, 2.5, 5];

// `whole` is for counts: a step that isn't a whole number (the 2.5 step at the
// smallest sizes) is skipped, so a trade count never reads "7.5".
export function valueTicks(min, max, { whole = false } = {}) {
  const lo = Math.min(0, min);
  // lo + 1: a curve flat at zero still gets a scale.
  const hi = Math.max(0, max, lo + 1);
  // Start at the power of ten where a step could first fit the range in
  // MAX_INTERVALS, and grow it: the loop always ends, because a step as large as
  // the range covers it in at most two intervals. The values must be numbers:
  // an empty chart's Infinity and -Infinity become 0 and 1 above, but NaN
  // would never fit.
  for (let power = Math.floor(Math.log10((hi - lo) / MAX_INTERVALS)); ; power += 1) {
    for (const multiple of ROUND_STEPS) {
      const step = multiple * 10 ** power;
      if (step < 1 || (whole && !Number.isInteger(step))) continue;
      const first = Math.floor(lo / step);
      const last = Math.ceil(hi / step);
      if (last - first <= MAX_INTERVALS) {
        return Array.from({ length: last - first + 1 }, (_, i) => (first + i) * step);
      }
    }
  }
}

// One column per calendar month from the first month to the last ('YYYY-MM',
// oldest first, as monthlySummary gives them), so a month with no closed trade
// shows as an empty slot (netPnl null) rather than vanishing. Up to a year,
// every column is labelled; up to three years, only quarter starts (Jan, Apr,
// Jul, Oct); past that, only Januaries. Choosing them here, rather than letting
// the chart thin crowded labels, keeps the year boundary from being dropped.
// When the months cross a year, the first label and each January also carry a
// year, kept apart from the month so the axis can set it on a second line.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthColumns(months) {
  if (months.length === 0) return [];
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const [firstYear, firstMonth] = months[0].month.split('-').map(Number);
  const [lastYear, lastMonth] = months.at(-1).month.split('-').map(Number);
  const multiYear = firstYear !== lastYear;
  const count = lastYear * 12 + lastMonth - (firstYear * 12 + firstMonth) + 1;
  const every = count <= 12 ? 1 : count <= 36 ? 3 : 12;

  const columns = [];
  let labelled = 0;
  for (let i = 0, year = firstYear, month = firstMonth; i < count; i += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    let label = '';
    let labelYear = null;
    if ((month - 1) % every === 0) {
      label = MONTHS[month - 1];
      if (multiYear && (labelled === 0 || month === 1)) labelYear = year;
      labelled += 1;
    }
    columns.push({ month: key, label, year: labelYear, ...(byMonth.get(key) ?? { netPnl: null }) });
    [year, month] = month === 12 ? [year + 1, 1] : [year, month + 1];
  }
  return columns;
}

// monthColumns for the wins, losses, scratches chart: each month's losses also
// as a negative count (`lossesBelow`), so the bars stack them below zero. The
// `|| 0` keeps a month with no losses at 0 rather than -0.
export function outcomeColumns(months) {
  return monthColumns(months).map((c) => ({
    ...c,
    lossesBelow: c.losses == null ? null : -c.losses || 0,
  }));
}

// Whole-trade ticks from the most losses in a month (below zero) to the tallest
// stack of wins and scratches.
export function outcomeTicks(months) {
  return valueTicks(
    Math.min(0, ...months.map((m) => -m.losses)),
    Math.max(0, ...months.map((m) => m.wins + m.scratches)),
    { whole: true }
  );
}

// Dollar ticks for the average win and average loss chart: from the largest
// average loss (negative) to the largest average win. A month without wins or
// losses has no average there, and is left out of the range.
export function averageTicks(months) {
  const values = months.flatMap((m) => [m.avgWin, m.avgLoss]).filter(Number.isFinite);
  return valueTicks(Math.min(0, ...values), Math.max(0, ...values));
}

// Dollar ticks for the expectancy by month chart, from the lowest to the highest
// net expectancy. A month with no value is left out of the range, so a missing
// number never reaches valueTicks, where NaN never finishes.
export function expectancyTicks(months) {
  const values = months.map((m) => m.netExpectancy).filter(Number.isFinite);
  return valueTicks(Math.min(0, ...values), Math.max(0, ...values));
}

// Ticks for the profit factor by month chart: zero up past the highest net profit
// factor, and never below 2, so the 1.0 baseline always has room above and below
// it. A month with no value is left out of the range.
export function profitFactorTicks(months) {
  const values = months.map((m) => m.netProfitFactor).filter(Number.isFinite);
  return valueTicks(0, Math.max(2, ...values));
}

// monthColumns for the fees vs gross chart: each month's fees also as a negative
// amount (`feesBelow`), so the bar hangs below zero like a cost. The `|| 0` keeps
// a month with no fees at 0 rather than -0.
export function feeColumns(months) {
  return monthColumns(months).map((c) => ({
    ...c,
    feesBelow: c.fees == null ? null : -c.fees || 0,
  }));
}

// Dollar ticks for the fees vs gross chart: from the lowest gross P/L or fees
// (below zero) to the highest gross P/L. A month with no value is left out.
export function feeTicks(months) {
  const gross = months.map((m) => m.grossPnl).filter(Number.isFinite);
  const fees = months.map((m) => -m.fees).filter(Number.isFinite);
  return valueTicks(Math.min(0, ...gross, ...fees), Math.max(0, ...gross));
}
