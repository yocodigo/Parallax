'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { timeTicks, valueTicks } from '@/lib/chartTicks';
import { formatProfitLoss } from '@/lib/format';

// Same line blue as EquityCurve (see the note there on contrast in both themes).
// Gross is the quieter gray, dashed so the two never rely on color alone.
const theme = (name) => `rgb(var(--color-${name}))`;
const NET = theme('blue-500');
const GROSS = theme('gray-500');

const SIZE = 20;

const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const closeTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

// The trend in words: the chart's text alternative, shown to everyone.
function summary(points) {
  const last = points.at(-1);
  const now = `${formatProfitLoss(last.netExpectancy)} (${formatProfitLoss(last.expectancy)} gross)`;
  if (points.length === 1) {
    return `Net expectancy per trade is ${now}, from one window of ${SIZE} trades.`;
  }
  const nets = points.map((p) => p.netExpectancy);
  const range = `between a low of ${formatProfitLoss(Math.min(...nets))} and a high of ${formatProfitLoss(Math.max(...nets))}`;
  return `Net expectancy per trade ended at ${now}, after ${points.length} windows, ${range}.`;
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function RollingTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { closedAt, expectancy, netExpectancy, index } = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatProfitLoss(netExpectancy)} net</p>
      <p className="text-gray-500 tabular-nums">{formatProfitLoss(expectancy)} gross</p>
      <p className="mt-0.5 text-gray-500">
        {/* The first window ends on trade SIZE, so point i ends on trade i + SIZE. */}
        Through trade {index + SIZE} · {closeTime.format(new Date(closedAt))} ET
      </p>
    </div>
  );
}

// Expectancy per trade over the last 20 closed trades (the route's `rolling`),
// one point per close once a full window exists.
export default function RollingExpectancy({ points }) {
  const data = points.map((point, index) => ({ ...point, index }));
  const ticks = timeTicks(points.map((p) => p.closedAt));
  const tickLabels = new Map(ticks.map(({ index, label }) => [index, label]));
  const values = points.flatMap((p) => [p.expectancy, p.netExpectancy]);
  const yTicks = valueTicks(Math.min(...values), Math.max(...values));
  const last = data.at(-1);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Expectancy, last {SIZE} trades</h2>
        <p className="text-xs text-gray-500">
          Average P/L per trade over a sliding window. Solid is net of fees, dashed is gross.
        </p>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-500">Shows once {SIZE} trades have closed in this range.</p>
      ) : (
        <>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 88, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke={theme('gray-200')} />
                <XAxis
                  dataKey="index"
                  ticks={ticks.map((t) => t.index)}
                  tickFormatter={(index) => tickLabels.get(index) ?? ''}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11, fill: theme('gray-500') }}
                />
                <YAxis
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
                  content={<RollingTooltip />}
                  cursor={{ stroke: theme('gray-400'), strokeWidth: 1 }}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="expectancy"
                  stroke={GROSS}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="netExpectancy"
                  stroke={NET}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 4, fill: NET, stroke: theme('white'), strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                {/* Where the net line ends, labelled: the one value worth reading off the chart. */}
                <ReferenceDot
                  x={last.index}
                  y={last.netExpectancy}
                  r={4}
                  fill={NET}
                  stroke={theme('white')}
                  strokeWidth={2}
                  label={{
                    value: formatProfitLoss(last.netExpectancy),
                    position: 'right',
                    offset: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    fill: theme('gray-900'),
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(points)}</p>
        </>
      )}
    </section>
  );
}
