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
import { monthColumns, valueTicks } from '@/lib/chartTicks';
import { monthTick } from './MonthlyPnl';

// Same fixed green and red as MonthlyPnl (see the note there on contrast on both
// cards). Scratches are neither, so they take the theme's gray.
const theme = (name) => `rgb(var(--color-${name}))`;
const WIN = '#16a34a';
const LOSS = '#dc2626';
const SCRATCH = theme('gray-400');

const fullMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const tradeCount = (count) => `${count} ${count === 1 ? 'trade' : 'trades'}`;
const scratchCount = (count) => `${count} ${count === 1 ? 'scratch' : 'scratches'}`;

// The range in words: the chart's text alternative, shown to everyone.
function summary(months) {
  const total = (key) => months.reduce((sum, m) => sum + m[key], 0);
  return `${tradeCount(total('trades'))}: ${total('wins')} won, ${total('losses')} lost, ${scratchCount(total('scratches'))}.`;
}

// The hover and keyboard readout: the counts first, then what they belong to.
export function OutcomeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { month, wins, losses, scratches, trades } = payload[0].payload;
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
            {wins} won · {losses} lost · {scratchCount(scratches)}
          </p>
          <p className="mt-0.5 text-gray-500">
            {name} · {tradeCount(trades)}
          </p>
        </>
      )}
    </div>
  );
}

// Trades of each New York month (the route's `months`) by outcome, on gross P/L.
// Wins stack up from zero with scratches on top, and losses hang below it as
// negative counts, so the sign never rests on color alone.
export default function WinsLossesScratches({ months }) {
  const columns = monthColumns(months).map((c) => ({
    ...c,
    lossesBelow: c.losses == null ? null : -c.losses,
  }));
  // The axis runs from the most losses in a month (below zero) to the tallest
  // stack of wins and scratches, in whole trades.
  const yTicks = valueTicks(
    Math.min(0, ...months.map((m) => -m.losses)),
    Math.max(0, ...months.map((m) => m.wins + m.scratches)),
    { whole: true }
  );

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Wins, losses, scratches by month</h2>
        <p className="text-xs text-gray-500">
          Trades by the New York month they closed in. Wins (green) and scratches (gray, break-even) rise from the
          line; losses (red) hang below it. Judged on gross P/L.
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
                  // Counts below the line are negative in the data; the axis reads them as counts.
                  tickFormatter={(value) => Math.abs(value)}
                  width={36}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500'), style: { fontVariantNumeric: 'tabular-nums' } }}
                />
                <ReferenceLine y={0} stroke={theme('gray-400')} />
                {/* filterNull off, so an empty month still shows its "No trades" readout. */}
                <Tooltip content={<OutcomeTooltip />} cursor={false} filterNull={false} isAnimationActive={false} />
                {/* One stackId: Recharts stacks the positive values up and the negative one down. */}
                <Bar dataKey="wins" stackId="outcome" fill={WIN} maxBarSize={24} isAnimationActive={false} />
                <Bar dataKey="scratches" stackId="outcome" fill={SCRATCH} maxBarSize={24} isAnimationActive={false} />
                <Bar dataKey="lossesBelow" stackId="outcome" fill={LOSS} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(months)}</p>
        </>
      )}
    </section>
  );
}
