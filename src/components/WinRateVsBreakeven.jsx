'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { monthColumns } from '@/lib/chartTicks';
import { monthTick } from './MonthlyPnl';

// Win rate in the line blue the other charts use; breakeven the quieter gray,
// dashed, so the two never rely on color alone.
const theme = (name) => `rgb(var(--color-${name}))`;
const WIN_RATE = theme('blue-500');
const BREAKEVEN = theme('gray-500');

const RATE_TICKS = [0, 0.25, 0.5, 0.75, 1];

const fullMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const percent = (rate) => `${Math.round(rate * 100)}%`;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// The months in words: the chart's text alternative, shown to everyone. A month
// with no breakeven rate (it needs a win and a loss) can't be compared.
function summary(months) {
  const comparable = months.filter((m) => m.breakevenWinRate !== null);
  if (comparable.length === 0) {
    return 'No month had both a win and a loss, so there is no breakeven rate to compare.';
  }
  const above = comparable.filter((m) => m.winRate > m.breakevenWinRate).length;
  const left = months.length - comparable.length;
  const parts = [`Win rate was above breakeven in ${above} of ${plural(comparable.length, 'month')}.`];
  if (left > 0) parts.push(`${plural(left, 'month')} had no breakeven rate (no wins or no losses).`);
  return parts.join(' ');
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function WinRateTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { month, winRate, breakevenWinRate, trades } = payload[0].payload;
  const [year, monthNumber] = month.split('-').map(Number);
  const name = fullMonth.format(Date.UTC(year, monthNumber - 1, 1));
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      {winRate == null ? (
        <>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-gray-500">No trades</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-900 tabular-nums">{percent(winRate)} win rate</p>
          <p className="text-gray-500 tabular-nums">
            {breakevenWinRate === null
              ? 'No breakeven rate: needs a win and a loss'
              : `${percent(breakevenWinRate)} needed to break even`}
          </p>
          <p className="mt-0.5 text-gray-500">
            {name} · {plural(trades, 'trade')}
          </p>
        </>
      )}
    </div>
  );
}

// Win rate and breakeven win rate of each New York month (the route's `months`).
// Above the dashed line a month's win rate more than covered its losses.
export default function WinRateVsBreakeven({ months }) {
  const columns = monthColumns(months);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Win rate vs breakeven</h2>
        <p className="text-xs text-gray-500">
          Solid: share of trades that won. Dashed: the share needed to break even at that month&apos;s average win and
          loss. Both are judged on gross P/L, and scratches count as trades, so a month with many looks lower against
          the dashed line.
        </p>
      </div>

      {months.length === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={columns} margin={{ top: 4, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} horizontalValues={RATE_TICKS} stroke={theme('gray-200')} />
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
                  ticks={RATE_TICKS}
                  domain={[0, 1]}
                  interval={0}
                  tickFormatter={percent}
                  width={44}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500'), style: { fontVariantNumeric: 'tabular-nums' } }}
                />
                {/* filterNull off, so an empty month still shows its "No trades" readout. */}
                <Tooltip content={<WinRateTooltip />} filterNull={false} isAnimationActive={false} />
                {/* No connectNulls: a month with no trades or no breakeven rate breaks the line
                    rather than drawing a value that isn't there; the dots keep a lone month visible. */}
                <Line
                  dataKey="breakevenWinRate"
                  stroke={BREAKEVEN}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 3, fill: BREAKEVEN, strokeWidth: 0 }}
                  activeDot={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="winRate"
                  stroke={WIN_RATE}
                  strokeWidth={2}
                  dot={{ r: 3, fill: WIN_RATE, strokeWidth: 0 }}
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
