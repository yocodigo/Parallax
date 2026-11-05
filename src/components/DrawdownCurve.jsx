'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { timeTicks, valueTicks } from '@/lib/chartTicks';
import { formatProfitLoss } from '@/lib/format';
import { closeTime } from './EquityCurve';

// The same fixed red as the other loss marks (see MonthlyPnl). The curve hangs
// below the zero line, so the direction never rests on color alone.
const theme = (name) => `rgb(var(--color-${name}))`;
const LOSS = '#dc2626';

const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fullDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

// The curve in words: the chart's text alternative, shown to everyone. Names the
// first trade to reach the deepest point, and where the account stands now.
function summary(points) {
  const deepest = Math.max(...points.map((p) => p.drawdown));
  if (deepest === 0) return 'No drawdown: the account never fell below its peak.';
  const index = points.findIndex((p) => p.drawdown === deepest);
  const now = points.at(-1).drawdown;
  return (
    `Deepest drawdown: ${formatProfitLoss(-deepest)}, after trade ${index + 1} (${fullDate.format(new Date(points[index].closedAt))}). ` +
    (now > 0 ? `Now ${formatProfitLoss(-now)} from the peak.` : 'Now at the peak.')
  );
}

// The hover and keyboard readout: the distance from the peak first, then what it belongs to.
export function DrawdownTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { closedAt, cumulative, drawdown, index } = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold text-gray-900 tabular-nums">
        {drawdown > 0 ? `${formatProfitLoss(-drawdown)} from peak` : 'At peak'}
      </p>
      <p className="mt-0.5 text-gray-500">
        Trade {index + 1} · {closeTime.format(new Date(closedAt))} ET
      </p>
      <p className="text-gray-500 tabular-nums">{formatProfitLoss(cumulative)} net P/L</p>
    </div>
  );
}

// How far the account sits below its running peak after each closed trade (the
// route's `equity`): the underwater curve, zero at a new high.
export default function DrawdownCurve({ points }) {
  const data = points.map((point, index) => ({ ...point, index, underwater: -point.drawdown || 0 }));
  const ticks = timeTicks(points.map((p) => p.closedAt));
  const tickLabels = new Map(ticks.map(({ index, label }) => [index, label]));
  const yTicks = valueTicks(Math.min(0, ...data.map((p) => p.underwater)), 0);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Drawdown</h2>
        <p className="text-xs text-gray-500">
          Net P/L below its running peak after each closed trade. Zero means a new high.
        </p>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
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
                  content={<DrawdownTooltip />}
                  cursor={{ stroke: theme('gray-400'), strokeWidth: 1 }}
                  isAnimationActive={false}
                />
                <Area
                  type="linear"
                  dataKey="underwater"
                  baseValue={0}
                  stroke={LOSS}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill={LOSS}
                  fillOpacity={0.15}
                  dot={false}
                  activeDot={{ r: 4, fill: LOSS, stroke: theme('white'), strokeWidth: 2 }}
                  isAnimationActive={false}
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
