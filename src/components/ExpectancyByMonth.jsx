'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { expectancyTicks, monthColumns } from '@/lib/chartTicks';
import { formatProfitLoss } from '@/lib/format';
import { monthTick } from './MonthlyPnl';

// Same fixed green and red as MonthlyPnl (see the note there on contrast on both
// cards). Gains rise from the zero line and losses hang below it, so the sign
// never rests on color alone.
const theme = (name) => `rgb(var(--color-${name}))`;
const GAIN = '#16a34a';
const LOSS = '#dc2626';

const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fullMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (key) => MONTH_NAMES[Number(key.split('-')[1]) - 1];
const tradeCount = (count) => `${count} ${count === 1 ? 'trade' : 'trades'}`;

// The months in words: the chart's text alternative, shown to everyone. Names the
// best month if any gained and the worst if any lost.
function summary(months) {
  const positive = months.filter((m) => m.netExpectancy > 0).length;
  const best = months.reduce((a, b) => (b.netExpectancy > a.netExpectancy ? b : a), months[0]);
  const worst = months.reduce((a, b) => (b.netExpectancy < a.netExpectancy ? b : a), months[0]);
  const parts = [
    `Net expectancy per trade was positive in ${positive} of ${months.length} ${months.length === 1 ? 'month' : 'months'}.`,
  ];
  if (best.netExpectancy > 0) parts.push(`Best: ${monthName(best.month)}, ${formatProfitLoss(best.netExpectancy)}.`);
  if (worst.netExpectancy < 0) parts.push(`Worst: ${monthName(worst.month)}, ${formatProfitLoss(worst.netExpectancy)}.`);
  return parts.join(' ');
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function ExpectancyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { month, netExpectancy, expectancy, trades } = payload[0].payload;
  const [year, monthNumber] = month.split('-').map(Number);
  const name = fullMonth.format(Date.UTC(year, monthNumber - 1, 1));
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      {netExpectancy == null ? (
        <>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-gray-500">No trades</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatProfitLoss(netExpectancy)} net</p>
          <p className="text-gray-500 tabular-nums">{formatProfitLoss(expectancy)} gross</p>
          <p className="mt-0.5 text-gray-500">
            {name} · {tradeCount(trades)}
          </p>
        </>
      )}
    </div>
  );
}

// Net expectancy per trade of each New York month (the route's `months`): the
// average dollars a trade made or lost after fees. Gross is in the tooltip.
export default function ExpectancyByMonth({ months }) {
  const columns = monthColumns(months);
  const yTicks = expectancyTicks(months);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Expectancy by month</h2>
        <p className="text-xs text-gray-500">
          Net P/L per trade, after fees, by the New York month each trade closed in.
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
                <Tooltip content={<ExpectancyTooltip />} cursor={false} filterNull={false} isAnimationActive={false} />
                <Bar
                  dataKey="netExpectancy"
                  maxBarSize={24}
                  radius={[4, 4, 0, 0]}
                  activeBar={{ fillOpacity: 0.75 }}
                  isAnimationActive={false}
                >
                  {columns.map((column) => (
                    <Cell key={column.month} fill={column.netExpectancy < 0 ? LOSS : GAIN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(months)}</p>
        </>
      )}
    </section>
  );
}
