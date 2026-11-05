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

// One bar per symbol, this tall each, so a long list scrolls the page and not the labels.
const ROW_HEIGHT = 28;
const MIN_HEIGHT = 120;
// Room for the x axis and the chart's margins, on top of the rows.
const AXIS_HEIGHT = 32;

// The best and worst symbol in words: the chart's text alternative, shown to everyone.
// The rows come best first. A worst symbol is named only if it lost money.
function summary(rows) {
  const best = rows[0];
  const worst = rows.at(-1);
  const parts = [`${rows.length} ${rows.length === 1 ? 'symbol' : 'symbols'}.`];
  parts.push(`Best: ${best.symbol}, ${formatProfitLoss(best.netPnl)}.`);
  if (rows.length > 1 && worst.netPnl < 0) parts.push(`Worst: ${worst.symbol}, ${formatProfitLoss(worst.netPnl)}.`);
  return parts.join(' ');
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function UnderlyingTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { symbol, trades, netPnl, winRate, netExpectancy } = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatProfitLoss(netPnl)}</p>
      <p className="mt-0.5 text-gray-500">{symbol}</p>
      <p className="text-gray-500 tabular-nums">
        {tradeCount(trades)} · {percent.format(winRate)} win rate · {formatProfitLoss(netExpectancy)} per trade
      </p>
    </div>
  );
}

// Net P/L per underlying symbol (the route's `byUnderlying`, best first), as
// horizontal bars from the zero line.
export default function ByUnderlying({ rows }) {
  const xTicks = valueTicks(Math.min(...rows.map((r) => r.netPnl)), Math.max(...rows.map((r) => r.netPnl)));

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Results by underlying</h2>
        <p className="text-xs text-gray-500">Net P/L per symbol traded in this range, the best first.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : (
        <>
          <div style={{ height: Math.max(MIN_HEIGHT, rows.length * ROW_HEIGHT + AXIS_HEIGHT) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid horizontal={false} verticalValues={xTicks} stroke={theme('gray-200')} />
                <XAxis
                  type="number"
                  ticks={xTicks}
                  domain={[xTicks[0], xTicks.at(-1)]}
                  interval={0}
                  tickFormatter={(value) => compactMoney.format(value)}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11, fill: theme('gray-500'), style: { fontVariantNumeric: 'tabular-nums' } }}
                />
                <YAxis
                  type="category"
                  dataKey="symbol"
                  interval={0}
                  width={52}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500') }}
                />
                <ReferenceLine x={0} stroke={theme('gray-400')} />
                <Tooltip content={<UnderlyingTooltip />} cursor={false} isAnimationActive={false} />
                <Bar dataKey="netPnl" maxBarSize={16} radius={[0, 4, 4, 0]} activeBar={{ fillOpacity: 0.75 }} isAnimationActive={false}>
                  {rows.map((r) => (
                    <Cell key={r.symbol} fill={r.netPnl < 0 ? LOSS : GAIN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(rows)}</p>
        </>
      )}
    </section>
  );
}
