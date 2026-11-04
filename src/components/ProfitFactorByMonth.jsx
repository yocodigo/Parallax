'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { monthColumns, profitFactorTicks } from '@/lib/chartTicks';
import { monthTick } from './MonthlyPnl';

// The line blue the other charts use; the 1.0 baseline the quieter gray, dashed,
// so the two never rely on color alone.
const theme = (name) => `rgb(var(--color-${name}))`;
const LINE = theme('blue-500');
const BASELINE = theme('gray-500');

const fullMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const factor = (value) => (value == null ? '—' : value.toFixed(2));
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// The months in words: the chart's text alternative, shown to everyone. A month
// has no profit factor when it has no losses and no fees to divide by.
function summary(months) {
  const known = months.filter((m) => m.netProfitFactor !== null);
  if (known.length === 0) {
    return 'No month had a loss or a fee, so there is no profit factor to compare.';
  }
  const above = known.filter((m) => m.netProfitFactor > 1).length;
  const left = months.length - known.length;
  const parts = [`Net profit factor was above 1.0 in ${above} of ${plural(known.length, 'month')}.`];
  if (left > 0) parts.push(`${plural(left, 'month')} had none (no losses or fees).`);
  return parts.join(' ');
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function ProfitFactorTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { month, netProfitFactor, profitFactor, trades } = payload[0].payload;
  const [year, monthNumber] = month.split('-').map(Number);
  const name = fullMonth.format(Date.UTC(year, monthNumber - 1, 1));
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      {trades == null ? (
        <>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-gray-500">No trades</p>
        </>
      ) : netProfitFactor == null ? (
        <>
          <p className="text-sm font-semibold text-gray-900">No profit factor: needs a loss or a fee</p>
          <p className="mt-0.5 text-gray-500">
            {name} · {plural(trades, 'trade')}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-900 tabular-nums">{factor(netProfitFactor)} net</p>
          <p className="text-gray-500 tabular-nums">{factor(profitFactor)} gross</p>
          <p className="mt-0.5 text-gray-500">
            {name} · {plural(trades, 'trade')}
          </p>
        </>
      )}
    </div>
  );
}

// Net profit factor of each New York month (the route's `months`): dollars won
// per dollar lost and paid in fees. Above the dashed 1.0 line a month made money.
export default function ProfitFactorByMonth({ months }) {
  const columns = monthColumns(months);
  const yTicks = profitFactorTicks(months);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Profit factor by month</h2>
        <p className="text-xs text-gray-500">
          Winning trades&apos; total divided by losing trades&apos; total plus fees, by the New York month each trade closed
          in. The dashed line is 1.0, where a month breaks even. Gross, without fees, is in the tooltip.
        </p>
      </div>

      {months.length === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={columns} margin={{ top: 4, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
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
                  tickFormatter={(value) => value.toFixed(1)}
                  width={36}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500'), style: { fontVariantNumeric: 'tabular-nums' } }}
                />
                <ReferenceLine y={1} stroke={BASELINE} strokeWidth={2} strokeDasharray="5 4" />
                {/* filterNull off, so an empty month still shows its "No trades" readout. */}
                <Tooltip content={<ProfitFactorTooltip />} filterNull={false} isAnimationActive={false} />
                {/* No connectNulls: a month with no trades or no profit factor breaks the line
                    rather than drawing a value that isn't there; the dots keep a lone month visible. */}
                <Line
                  dataKey="netProfitFactor"
                  stroke={LINE}
                  strokeWidth={2}
                  dot={{ r: 3, fill: LINE, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(months)}</p>
        </>
      )}
    </section>
  );
}
