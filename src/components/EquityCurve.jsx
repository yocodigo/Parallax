'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { timeTicks, valueTicks } from '@/lib/chartTicks';
import { formatProfitLoss } from '@/lib/format';

// Theme colors as CSS variables, so the chart follows dark mode. Blue-500 is
// the middle shade, which the dark theme leaves as is, so the line is the same
// blue on both cards: 3.7:1 against white and 4.8:1 against gray-900, above
// the 3:1 that graphics need (WCAG 1.4.11). Blue-600 would turn into blue-400
// in dark mode, too light for a line on a dark card (OKLCH lightness 0.71,
// past the 0.48-0.67 we kept dark-mode marks within).
const theme = (name) => `rgb(var(--color-${name}))`;
const LINE = theme('blue-500');

// Axis ticks: "$0", "$500", "$1.5K", "-$200".
const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const nyFormat = (options) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...options });
export const closeTime = nyFormat({ weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const monthDay = nyFormat({ month: 'short', day: 'numeric' });
const fullDate = nyFormat({ month: 'short', day: 'numeric', year: 'numeric' });
const year = nyFormat({ year: 'numeric' });

// "Mar 10 to Apr 13, 2026", or with both years when they differ.
function dateRange(from, to) {
  if (year.format(from) !== year.format(to)) return `${fullDate.format(from)} to ${fullDate.format(to)}`;
  return `${monthDay.format(from)} to ${fullDate.format(to)}`;
}

// The curve in words: the chart's text alternative, shown to everyone.
function summary(points) {
  const first = new Date(points[0].closedAt);
  const last = new Date(points.at(-1).closedAt);
  const span =
    points.length === 1 ? `1 trade on ${fullDate.format(first)}` : `${points.length} trades from ${dateRange(first, last)}`;
  const deepest = Math.max(...points.map((p) => p.drawdown));
  const drawdown = deepest > 0 ? `Deepest drawdown: ${formatProfitLoss(-deepest)}.` : 'No drawdown.';
  return `${span}, ending at ${formatProfitLoss(points.at(-1).cumulative)}. ${drawdown}`;
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function EquityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { closedAt, cumulative, drawdown, index } = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatProfitLoss(cumulative)}</p>
      <p className="mt-0.5 text-gray-500">
        Trade {index + 1} · {closeTime.format(new Date(closedAt))} ET
      </p>
      <p className="text-gray-500 tabular-nums">{drawdown > 0 ? `${formatProfitLoss(-drawdown)} from peak` : 'At peak'}</p>
    </div>
  );
}

// Cumulative net P/L after each closed trade (the route's `equity`), one point
// per trade so a busy day isn't squeezed into a sliver of the axis.
export default function EquityCurve({ points }) {
  const data = points.map((point, index) => ({ ...point, index }));
  const ticks = timeTicks(points.map((p) => p.closedAt));
  const tickLabels = new Map(ticks.map(({ index, label }) => [index, label]));
  const values = points.map((p) => p.cumulative);
  const yTicks = valueTicks(Math.min(...values), Math.max(...values));
  const last = data.at(-1);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Equity curve</h2>
        <p className="text-xs text-gray-500">Cumulative net P/L after fees, trade by trade.</p>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : (
        <>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 12, right: 88, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke={theme('gray-200')} />
                <XAxis
                  dataKey="index"
                  ticks={ticks.map((t) => t.index)}
                  tickFormatter={(index) => tickLabels.get(index) ?? ''}
                  // Where day ticks crowd, Recharts drops some, keeping the first and last.
                  interval="preserveStartEnd"
                  minTickGap={24}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11, fill: theme('gray-500') }}
                />
                <YAxis
                  // Round ticks that always take in zero, where every curve starts.
                  ticks={yTicks}
                  domain={[yTicks[0], yTicks.at(-1)]}
                  interval={0}
                  tickFormatter={(value) => compactMoney.format(value)}
                  width={52}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500'), style: { fontVariantNumeric: 'tabular-nums' } }}
                />
                <ReferenceLine y={0} stroke={theme('gray-400')} />
                <Tooltip
                  content={<EquityTooltip />}
                  cursor={{ stroke: theme('gray-400'), strokeWidth: 1 }}
                  isAnimationActive={false}
                />
                <Area
                  type="linear"
                  dataKey="cumulative"
                  // The wash fills to the zero line, not the axis floor, so losses read as below it.
                  baseValue={0}
                  stroke={LINE}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill={LINE}
                  fillOpacity={0.1}
                  dot={false}
                  activeDot={{ r: 4, fill: LINE, stroke: theme('white'), strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                {/* Where the curve ends, labelled: the one value worth reading off the line. */}
                <ReferenceDot
                  x={last.index}
                  y={last.cumulative}
                  r={4}
                  fill={LINE}
                  stroke={theme('white')}
                  strokeWidth={2}
                  label={{
                    value: formatProfitLoss(last.cumulative),
                    position: 'right',
                    offset: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    fill: theme('gray-900'),
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(points)}</p>
        </>
      )}
    </section>
  );
}
