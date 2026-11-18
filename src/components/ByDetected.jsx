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
import { DETECTED_MAX_BARS } from '@/lib/setups/settings';
import { DETECTOR_LABELS } from '@/lib/strategy';

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

const LABELS = { ...DETECTOR_LABELS, any: 'Any setup', none: 'No setup detected' };

// One bar per row, this tall each, plus room for the x axis and the margins.
const ROW_HEIGHT = 28;
const MIN_HEIGHT = 120;
const AXIS_HEIGHT = 32;

// Each row's net P/L in words: the chart's text alternative, shown to everyone.
const summary = (rows) => rows.map((r) => `${r.label}: ${formatProfitLoss(r.netPnl)}.`).join(' ');

const unknownText = (count) =>
  `${count} ${count === 1 ? 'trade has' : 'trades have'} no detected setups stored: no context, one from before setups were detected, or no minute bars.`;

// The hover and keyboard readout: the value first, then what it belongs to.
export function DetectedTooltip({ active, payload }) {
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

// Net P/L by detected setup (the route's `byDetected`, rules-v3 section 6: a row per
// detector that fired, a trade in each of its own, then any setup against none, and
// `unknown`, the trades with no detected setups stored), as horizontal bars from the
// zero line.
export default function ByDetected({ detected: { rows: found, unknown } }) {
  const rows = found.map((r) => ({ ...r, label: LABELS[r.detector] }));
  const xTicks = rows.length
    ? valueTicks(Math.min(...rows.map((r) => r.netPnl)), Math.max(...rows.map((r) => r.netPnl)))
    : [];

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Results by detected setup</h2>
        <p className="text-xs text-gray-500">
          Net P/L by the setups detected on the chart within {DETECTED_MAX_BARS} bars of the entry, as stored with its
          context. Only setups there to trade count: complete, a valid break, or a trap; a weak or pending break, a band
          cross with no room, or a spent reversal reads as no setup. A trade with two setups counts in both rows; any
          setup against none says whether the setup matters.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No trades with detected setups in this range.</p>
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
                <Tooltip content={<DetectedTooltip />} cursor={false} isAnimationActive={false} />
                <Bar dataKey="netPnl" maxBarSize={16} radius={[0, 4, 4, 0]} activeBar={{ fillOpacity: 0.75 }} isAnimationActive={false}>
                  {rows.map((r) => (
                    <Cell key={r.detector} fill={r.netPnl < 0 ? LOSS : GAIN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(rows)}</p>
        </>
      )}
      {unknown > 0 && <p className="text-xs text-gray-500">{unknownText(unknown)}</p>}
    </section>
  );
}
