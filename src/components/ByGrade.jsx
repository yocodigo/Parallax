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

const LABELS = { A: 'A line', B: 'B line', none: 'No line' };

// One bar per grade, this tall each, plus room for the x axis and the margins.
const ROW_HEIGHT = 28;
const MIN_HEIGHT = 120;
const AXIS_HEIGHT = 32;

// Each grade's net P/L in words: the chart's text alternative, shown to everyone.
const summary = (rows) => rows.map((r) => `${r.label}: ${formatProfitLoss(r.netPnl)}.`).join(' ');

const ungraded = (count) =>
  `${count} ${count === 1 ? 'trade is' : 'trades are'} not graded: no stored context, or it lacks the minute bars.`;

// The hover and keyboard readout: the value first, then what it belongs to.
export function GradeTooltip({ active, payload }) {
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

// Net P/L per four-touch grade (the route's `byGrade`: rows A, B, no line, and
// `unknown`, the trades whose grade can't be told), as horizontal bars from the zero line.
export default function ByGrade({ grades: { rows: graded, unknown } }) {
  const rows = graded.map((r) => ({ ...r, label: LABELS[r.grade] }));
  const xTicks = rows.length
    ? valueTicks(Math.min(...rows.map((r) => r.netPnl)), Math.max(...rows.map((r) => r.netPnl)))
    : [];

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Results by four-touch grade</h2>
        <p className="text-xs text-gray-500">Net P/L by the grade of the four-touch line the entry went with, as stored with its context.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No graded trades in this range.</p>
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
                  width={80}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500') }}
                />
                <ReferenceLine x={0} stroke={theme('gray-400')} />
                <Tooltip content={<GradeTooltip />} cursor={false} isAnimationActive={false} />
                <Bar dataKey="netPnl" maxBarSize={16} radius={[0, 4, 4, 0]} activeBar={{ fillOpacity: 0.75 }} isAnimationActive={false}>
                  {rows.map((r) => (
                    <Cell key={r.grade} fill={r.netPnl < 0 ? LOSS : GAIN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(rows)}</p>
        </>
      )}
      {unknown > 0 && <p className="text-xs text-gray-500">{ungraded(unknown)}</p>}
    </section>
  );
}
