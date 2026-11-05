'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { monthColumns } from '@/lib/chartTicks';
import { formatProfitLoss } from '@/lib/format';
import { monthTick } from './MonthlyPnl';

// The line blue the other charts use.
const theme = (name) => `rgb(var(--color-${name}))`;
const LINE = theme('blue-500');

// The rating runs 1 to 10: fixed ticks across the scale, whatever the data.
const Y_TICKS = [1, 3, 5, 7, 10];

const fullMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const rated = (value) => value.toFixed(1);

const monthName = (month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return fullMonth.format(Date.UTC(year, monthNumber - 1, 1));
};

// The route's months with each month's rating row alongside, as one column per calendar
// month. A month with trades but no row has no rating, and the tooltip says so.
function ratingColumns(months, ratings) {
  const byMonth = new Map(ratings.map((r) => [r.month, r]));
  return monthColumns(months.map((m) => ({ ...m, average: null, reviews: 0, ...byMonth.get(m.month) })));
}

// The range in words: the chart's text alternative, shown to everyone.
function summary(columns) {
  const scored = columns.filter((c) => c.average != null);
  const reviews = scored.reduce((total, c) => total + c.reviews, 0);
  const overall = scored.reduce((total, c) => total + c.average * c.reviews, 0) / reviews;
  const best = scored.reduce((a, b) => (b.average > a.average ? b : a));
  const worst = scored.reduce((a, b) => (b.average < a.average ? b : a));
  const parts = [`Overall ${rated(overall)} of 10 across ${plural(reviews, 'review')}.`];
  parts.push(`Best month: ${monthName(best.month)}, ${rated(best.average)}.`);
  if (worst.average < best.average) parts.push(`Worst: ${monthName(worst.month)}, ${rated(worst.average)}.`);
  return parts.join(' ');
}

// The hover and keyboard readout: the average first, then the reviews and what the month made.
export function EmotionalControlTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { month, average, reviews, netPnl, trades } = payload[0].payload;
  const name = monthName(month);
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      {netPnl == null ? (
        <>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-gray-500">No trades</p>
        </>
      ) : (
        <>
          {average == null ? (
            <p className="text-sm font-semibold text-gray-900">No rating: no review was rated</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900 tabular-nums">{rated(average)} of 10</p>
              <p className="text-gray-500 tabular-nums">{plural(reviews, 'review')}</p>
            </>
          )}
          <p className="mt-0.5 text-gray-500 tabular-nums">
            {name} · {plural(trades, 'trade')} · {formatProfitLoss(netPnl)} net
          </p>
        </>
      )}
    </div>
  );
}

// The average emotional-control rating (1 to 10) of the reviews on trades closed in each
// New York month (the route's `emotionalControlByMonth`), beside what the month's trades
// made, which the tooltip gives and the Net P/L chart next to it draws.
export default function EmotionalControlByMonth({ months, ratings }) {
  const columns = ratingColumns(months, ratings);
  const anyRating = columns.some((c) => c.average != null);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Emotional control by month</h2>
        <p className="text-xs text-gray-500">
          The average 1 to 10 rating on the reviews of trades closed in each New York month, for the trades
          in the filters above. The month&apos;s net P/L is in the tooltip.
        </p>
      </div>

      {months.length === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : !anyRating ? (
        <p className="text-sm text-gray-500">No review in this range has an emotional-control rating.</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={columns} margin={{ top: 4, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
                {/* horizontalValues puts a gridline at each y tick. */}
                <CartesianGrid vertical={false} horizontalValues={Y_TICKS} stroke={theme('gray-200')} />
                <XAxis
                  dataKey="month"
                  ticks={columns.filter((c) => c.label).map((c) => c.month)}
                  interval={0}
                  height={columns.some((c) => c.year) ? 44 : 30}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  tick={monthTick(columns)}
                />
                <YAxis
                  ticks={Y_TICKS}
                  domain={[1, 10]}
                  interval={0}
                  width={28}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500'), style: { fontVariantNumeric: 'tabular-nums' } }}
                />
                {/* filterNull off, so an empty month still shows its "No trades" readout. */}
                <Tooltip content={<EmotionalControlTooltip />} filterNull={false} isAnimationActive={false} />
                {/* No connectNulls: a month with no rating breaks the line rather than drawing
                    a value that isn't there; the dots keep a lone month visible. */}
                <Line
                  dataKey="average"
                  stroke={LINE}
                  strokeWidth={2}
                  dot={{ r: 3, fill: LINE, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(columns)}</p>
        </>
      )}
    </section>
  );
}
