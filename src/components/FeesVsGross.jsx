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
import { feeColumns, feeTicks } from '@/lib/chartTicks';
import { formatProfitLoss } from '@/lib/format';
import { monthTick } from './MonthlyPnl';

// Same fixed green and red as MonthlyPnl (see the note there on contrast on both
// cards). Gross P/L rises from the zero line or hangs below it. Fees are a cost,
// so they always hang below it, in amber: the position tells them apart from a loss.
const theme = (name) => `rgb(var(--color-${name}))`;
const GAIN = '#16a34a';
const LOSS = '#dc2626';

const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const plainMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fullMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const tradeCount = (count) => `${count} ${count === 1 ? 'trade' : 'trades'}`;
const percent = (part, whole) => `${((part / whole) * 100).toFixed(1)}%`;

// The range in words: the chart's text alternative, shown to everyone. Fees are
// compared with gross profit, which only means something while there is some.
function summary(months) {
  const gross = months.reduce((total, m) => total + m.grossPnl, 0);
  const fees = months.reduce((total, m) => total + m.fees, 0);
  if (gross <= 0) {
    return `Gross P/L was ${formatProfitLoss(gross)}, and fees added ${plainMoney.format(fees)} to the loss.`;
  }
  return `Fees took ${percent(fees, gross)} of gross P/L: ${plainMoney.format(fees)} of ${plainMoney.format(gross)}.`;
}

// The hover and keyboard readout: gross first, then the fees and what is left.
export function FeesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { month, grossPnl, fees, netPnl, trades } = payload[0].payload;
  const [year, monthNumber] = month.split('-').map(Number);
  const name = fullMonth.format(Date.UTC(year, monthNumber - 1, 1));
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      {grossPnl == null ? (
        <>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-gray-500">No trades</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatProfitLoss(grossPnl)} gross</p>
          <p className="text-gray-500 tabular-nums">
            {plainMoney.format(fees)} fees{grossPnl > 0 ? ` (${percent(fees, grossPnl)} of gross)` : ''}
          </p>
          <p className="text-gray-500 tabular-nums">{formatProfitLoss(netPnl)} net</p>
          <p className="mt-0.5 text-gray-500">
            {name} · {tradeCount(trades)}
          </p>
        </>
      )}
    </div>
  );
}

// Gross P/L and fees of each New York month (the route's `months`), side by side:
// what the trades made before costs, and what the costs took.
export default function FeesVsGross({ months }) {
  const columns = feeColumns(months);
  const yTicks = feeTicks(months);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Fees vs gross P/L</h2>
        <p className="text-xs text-gray-500">
          By the New York month each trade closed in. Gross P/L (green or red) rises or falls from the line; fees
          (amber) always hang below it.
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
                <Tooltip content={<FeesTooltip />} cursor={false} filterNull={false} isAnimationActive={false} />
                <Bar dataKey="grossPnl" maxBarSize={16} isAnimationActive={false} activeBar={{ fillOpacity: 0.75 }}>
                  {columns.map((column) => (
                    <Cell key={column.month} fill={column.grossPnl < 0 ? LOSS : GAIN} />
                  ))}
                </Bar>
                <Bar
                  dataKey="feesBelow"
                  fill={theme('amber-500')}
                  maxBarSize={16}
                  isAnimationActive={false}
                  activeBar={{ fillOpacity: 0.75 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(months)}</p>
        </>
      )}
    </section>
  );
}
