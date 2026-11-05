'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { valueTicks } from '@/lib/chartTicks';

const theme = (name) => `rgb(var(--color-${name}))`;

// Below 0R red, 0R and up green, as on the monthly chart (see the note in MonthlyPnl.jsx
// on why these are fixed hex and why the sign never rests on color alone: the axis
// labels each bin's range).
const GAIN = '#16a34a';
const LOSS = '#dc2626';

const tradeCount = (count) => `${count} ${count === 1 ? 'trade' : 'trades'}`;
const range = ({ from, to }) => `${from}R to ${to}R`;

// What the chart covers in words: the chart's text alternative, shown to everyone.
// Options without a stop have no R, so the chart says how many it leaves out.
function summary({ bins, measured, total }) {
  const below = bins.filter((b) => b.from < 0).reduce((sum, b) => sum + b.count, 0);
  const coverage =
    measured === total
      ? `All ${total} closed trades have an R.`
      : `${measured} of ${total} closed trades have an R (the rest have no initial stop).`;
  return `${coverage} ${below} below 0R, ${measured - below} at 0R or better.`;
}

// The hover and keyboard readout: the count first, then the range it belongs to.
export function BinTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const bin = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold text-gray-900 tabular-nums">
        {bin.count > 0 ? tradeCount(bin.count) : 'No trades'}
      </p>
      <p className="mt-0.5 text-gray-500">{range(bin)}</p>
    </div>
  );
}

// How many closed trades ended in each band of R (the route's `rDistribution`):
// the shape of the wins and losses, which the averages hide.
export default function RDistribution({ distribution }) {
  const { bins, measured, total } = distribution;
  const yTicks = valueTicks(0, Math.max(...bins.map((b) => b.count)), { whole: true });

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">R-multiple distribution</h2>
        <p className="text-xs text-gray-500">
          Closed trades by result in R (net of fees), in bands one R wide. Only trades with an initial stop have an R.
        </p>
      </div>

      {total === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : measured === 0 ? (
        <p className="text-sm text-gray-500">None of the {total} closed trades has an initial stop, so none has an R.</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bins} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap={2} accessibilityLayer>
                <CartesianGrid vertical={false} horizontalValues={yTicks} stroke={theme('gray-200')} />
                <XAxis
                  dataKey="from"
                  // Recharts passes the tick's index second: label the whole band, not just its start.
                  tickFormatter={(from, i) => range(bins[i])}
                  interval={bins.length > 8 ? Math.ceil(bins.length / 8) - 1 : 0}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11, fill: theme('gray-500') }}
                />
                <YAxis
                  ticks={yTicks}
                  domain={[0, yTicks.at(-1)]}
                  interval={0}
                  allowDecimals={false}
                  width={32}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500'), style: { fontVariantNumeric: 'tabular-nums' } }}
                />
                {/* The whole slot answers the pointer, so an empty band can say so. */}
                <Tooltip content={<BinTooltip />} cursor={false} isAnimationActive={false} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} activeBar={{ fillOpacity: 0.75 }} isAnimationActive={false}>
                  {bins.map((b) => (
                    <Cell key={b.from} fill={b.from < 0 ? LOSS : GAIN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(distribution)}</p>
        </>
      )}
    </section>
  );
}
