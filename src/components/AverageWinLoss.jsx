'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { averageTicks, monthColumns } from '@/lib/chartTicks';
import { formatProfitLoss } from '@/lib/format';
import { monthTick } from './MonthlyPnl';

// Same fixed green and red as MonthlyPnl (see the note there on contrast on both
// cards). The average loss is already negative, so it hangs below the line and
// the sign never rests on color alone.
const theme = (name) => `rgb(var(--color-${name}))`;
const WIN = '#16a34a';
const LOSS = '#dc2626';

const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fullMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthCount = (count) => `${count} ${count === 1 ? 'month' : 'months'}`;
const tradeCount = (count) => `${count} ${count === 1 ? 'trade' : 'trades'}`;

// The months in words: the chart's text alternative, shown to everyone. A month
// with no wins or no losses has no average on one side, so can't be compared.
function summary(months) {
  const comparable = months.filter((m) => m.avgWin != null && m.avgLoss != null);
  if (comparable.length === 0) return 'No month had both a win and a loss to compare.';
  const larger = comparable.filter((m) => m.avgWin > -m.avgLoss).length;
  const left = months.length - comparable.length;
  const parts = [`The average win was larger than the average loss in ${larger} of ${monthCount(comparable.length)}.`];
  if (left > 0) parts.push(`${monthCount(left)} had no wins or no losses to compare.`);
  return parts.join(' ');
}

// The hover and keyboard readout: the averages first, then what they belong to.
export function AverageTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { month, avgWin, avgLoss, trades } = payload[0].payload;
  const [year, monthNumber] = month.split('-').map(Number);
  const name = fullMonth.format(Date.UTC(year, monthNumber - 1, 1));
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      {trades == null ? (
        <>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-gray-500">No trades</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-900 tabular-nums">
            {avgWin == null ? 'no wins' : `${formatProfitLoss(avgWin)} avg win`} ·{' '}
            {avgLoss == null ? 'no losses' : `${formatProfitLoss(avgLoss)} avg loss`}
          </p>
          <p className="mt-0.5 text-gray-500">
            {name} · {tradeCount(trades)}
          </p>
        </>
      )}
    </div>
  );
}

// Average win and average loss of each New York month (the route's `months`), in
// dollars per trade on gross P/L. A bar taller above the line than below it means
// the average win outweighed the average loss.
export default function AverageWinLoss({ months }) {
  const columns = monthColumns(months);
  const yTicks = averageTicks(months);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Average win vs average loss</h2>
        <p className="text-xs text-gray-500">
          Dollars per trade on gross P/L, by the New York month each trade closed in. The average win (green) rises from
          the line and the average loss (red) hangs below it.
        </p>
      </div>

      {months.length === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={columns} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} horizontalValues={yTicks} stroke={theme('gray-200')} />
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
                {/* filterNull off, so an empty month still shows its "No trades" readout. */}
                <Tooltip content={<AverageTooltip />} cursor={false} filterNull={false} isAnimationActive={false} />
                {/* One stackId, so the win and the loss share a column, one up and one down. */}
                <Bar dataKey="avgWin" stackId="average" fill={WIN} maxBarSize={24} isAnimationActive={false} />
                <Bar dataKey="avgLoss" stackId="average" fill={LOSS} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(months)}</p>
        </>
      )}
    </section>
  );
}
