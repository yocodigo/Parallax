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
import { valueTicks } from '@/lib/chartTicks';
import { formatProfitLoss } from '@/lib/format';

const theme = (name) => `rgb(var(--color-${name}))`;

// Gains green, losses red, as on the monthly chart (see the note in MonthlyPnl.jsx on why
// these are fixed hex and why the sign never rests on color alone).
const GAIN = '#16a34a';
const LOSS = '#dc2626';

const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const tradeCount = (count) => `${count} ${count === 1 ? 'trade' : 'trades'}`;

const LABELS = { call: 'Calls', put: 'Puts' };

// Each side in words: the chart's text alternative, shown to everyone.
function summary(sides) {
  return sides
    .map(({ label, trades, netPnl }) =>
      trades > 0 ? `${label}: ${formatProfitLoss(netPnl)} over ${tradeCount(trades)}.` : `${label}: no trades.`
    )
    .join(' ');
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function SideTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { label, trades, netPnl, winRate, netExpectancy } = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold text-gray-900 tabular-nums">
        {trades > 0 ? formatProfitLoss(netPnl) : 'No trades'}
      </p>
      <p className="mt-0.5 text-gray-500">{label}</p>
      {trades > 0 && (
        <p className="text-gray-500 tabular-nums">
          {tradeCount(trades)} · {percent.format(winRate)} win rate · {formatProfitLoss(netExpectancy)} per trade
        </p>
      )}
    </div>
  );
}

// Net P/L of calls against puts (the route's `callsVsPuts`), two bars from the zero line.
export default function CallsVsPuts({ sides: rows }) {
  const sides = rows.map((row) => ({ ...row, label: LABELS[row.type] }));
  const yTicks = valueTicks(Math.min(...sides.map((s) => s.netPnl)), Math.max(...sides.map((s) => s.netPnl)));

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Calls vs puts</h2>
        <p className="text-xs text-gray-500">Net P/L of the option trades in this range, by the side of the contract.</p>
      </div>

      {sides.every((s) => s.trades === 0) ? (
        <p className="text-sm text-gray-500">No closed option trades in this range.</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sides} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} horizontalValues={yTicks} stroke={theme('gray-200')} />
                <XAxis
                  dataKey="label"
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
                <Tooltip content={<SideTooltip />} cursor={false} isAnimationActive={false} />
                <Bar dataKey="netPnl" maxBarSize={72} radius={[4, 4, 0, 0]} activeBar={{ fillOpacity: 0.75 }} isAnimationActive={false}>
                  {sides.map((s) => (
                    <Cell key={s.type} fill={s.netPnl < 0 ? LOSS : GAIN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(sides)}</p>
        </>
      )}
    </section>
  );
}
