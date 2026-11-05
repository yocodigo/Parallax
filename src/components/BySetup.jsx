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

// One bar per setup, this tall each, so a long list scrolls the page and not the labels.
const ROW_HEIGHT = 28;
const MIN_HEIGHT = 120;
// Room for the x axis and the chart's margins, on top of the rows.
const AXIS_HEIGHT = 32;

// The best and worst setup in words: the chart's text alternative, shown to everyone.
// The rows come best first with the trades that had no strategy last, who are
// reported but never ranked. A worst setup is named only if it lost money.
function summary(rows) {
  const named = rows.filter((r) => r.strategyId !== null);
  const none = rows.find((r) => r.strategyId === null);
  const parts = [`${rows.length} ${rows.length === 1 ? 'setup' : 'setups'}.`];
  if (named.length > 0) parts.push(`Best: ${named[0].label}, ${formatProfitLoss(named[0].netPnl)}.`);
  const worst = named.at(-1);
  if (named.length > 1 && worst.netPnl < 0) parts.push(`Worst: ${worst.label}, ${formatProfitLoss(worst.netPnl)}.`);
  if (none) parts.push(`No strategy: ${formatProfitLoss(none.netPnl)}.`);
  return parts.join(' ');
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function SetupTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { label, trades, netPnl, winRate, netExpectancy } = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatProfitLoss(netPnl)}</p>
      <p className="mt-0.5 text-gray-500">{label}</p>
      <p className="text-gray-500 tabular-nums">
        {tradeCount(trades)} · {percent.format(winRate)} win rate · {formatProfitLoss(netExpectancy)} per trade
      </p>
    </div>
  );
}

// Net P/L per setup (the route's `bySetup`: best first, the trades with no
// strategy last), as horizontal bars from the zero line.
export default function BySetup({ rows: setups }) {
  const rows = setups.map((setup) => ({ ...setup, label: setup.name ?? 'No strategy' }));
  const xTicks = valueTicks(Math.min(...rows.map((r) => r.netPnl)), Math.max(...rows.map((r) => r.netPnl)));

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Results by setup</h2>
        <p className="text-xs text-gray-500">Net P/L per setup (strategy) in this range, the best first; trades with no strategy last.</p>
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
                  dataKey="label"
                  interval={0}
                  width={120}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500') }}
                />
                <ReferenceLine x={0} stroke={theme('gray-400')} />
                <Tooltip content={<SetupTooltip />} cursor={false} isAnimationActive={false} />
                <Bar dataKey="netPnl" maxBarSize={16} radius={[0, 4, 4, 0]} activeBar={{ fillOpacity: 0.75 }} isAnimationActive={false}>
                  {rows.map((r) => (
                    <Cell key={r.strategyId ?? 'none'} fill={r.netPnl < 0 ? LOSS : GAIN} />
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
