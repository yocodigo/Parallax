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
import { formatProfitLoss } from '@/lib/format';
import { monthTick } from './MonthlyPnl';

// The line blue the other charts use.
const theme = (name) => `rgb(var(--color-${name}))`;
const LINE = theme('blue-500');

// 0 to 100% in quarters: a share of checks, so the scale doesn't depend on the data.
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

const fullMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const monthName = (month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return fullMonth.format(Date.UTC(year, monthNumber - 1, 1));
};

// The route's months with each month's discipline row (`discipline`) alongside, as one
// column per calendar month. A month with trades but no row (only stocks or crypto closed
// in it) or no check has no score, and the tooltip says so.
function disciplineColumns(months, discipline) {
  const byMonth = new Map(discipline.map((d) => [d.month, d]));
  return monthColumns(months.map((m) => ({ ...m, score: null, ok: 0, missed: 0, ...byMonth.get(m.month) })));
}

// The range in words: the chart's text alternative, shown to everyone.
function summary(columns) {
  const scored = columns.filter((c) => c.score != null);
  const ok = scored.reduce((total, c) => total + c.ok, 0);
  const checks = ok + scored.reduce((total, c) => total + c.missed, 0);
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));
  const parts = [`Overall ${percent.format(ok / checks)}: ${ok} of ${checks} checks passed.`];
  parts.push(`Best month: ${monthName(best.month)}, ${percent.format(best.score)}.`);
  if (worst.score < best.score) parts.push(`Worst: ${monthName(worst.month)}, ${percent.format(worst.score)}.`);
  return parts.join(' ');
}

// The hover and keyboard readout: the score first, then the checks and what the month made.
export function DisciplineTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { month, score, ok, missed, netPnl, trades } = payload[0].payload;
  const name = monthName(month);
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      {netPnl == null ? (
        <>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-gray-500">No trades</p>
        </>
      ) : (
        <>
          {score == null ? (
            <p className="text-sm font-semibold text-gray-900">No score: no check applied</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900 tabular-nums">{percent.format(score)}</p>
              <p className="text-gray-500 tabular-nums">
                {ok} of {ok + missed} checks passed
              </p>
            </>
          )}
          <p className="mt-0.5 text-gray-500 tabular-nums">
            {name} · {plural(trades, 'trade')} · {formatProfitLoss(netPnl)} net
          </p>
        </>
      )}
    </div>
  );
}

// The share of Plan OK, Stop OK, and Exit OK checks passed in each New York month
// (the route's `disciplineByMonth`), beside what the month's trades made, which the
// tooltip gives and the Net P/L chart next to it draws.
export default function DisciplineByMonth({ months, discipline }) {
  const columns = disciplineColumns(months, discipline);
  const anyScore = columns.some((c) => c.score != null);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Discipline score by month</h2>
        <p className="text-xs text-gray-500">
          Plan OK, Stop OK, and Exit OK checks passed out of the ones that applied, option trades only, by the New York
          month each trade closed in. The month&apos;s net P/L is in the tooltip.
        </p>
      </div>

      {months.length === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : !anyScore ? (
        <p className="text-sm text-gray-500">No month had a Plan, Stop, or Exit check to score.</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={columns} margin={{ top: 4, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} horizontalValues={Y_TICKS} stroke={theme('gray-200')} />
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
                  ticks={Y_TICKS}
                  domain={[0, 1]}
                  interval={0}
                  tickFormatter={(value) => percent.format(value)}
                  width={40}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500'), style: { fontVariantNumeric: 'tabular-nums' } }}
                />
                {/* filterNull off, so an empty month still shows its "No trades" readout. */}
                <Tooltip content={<DisciplineTooltip />} filterNull={false} isAnimationActive={false} />
                {/* No connectNulls: a month with no score breaks the line rather than drawing
                    a value that isn't there; the dots keep a lone month visible. */}
                <Line
                  dataKey="score"
                  stroke={LINE}
                  strokeWidth={2}
                  dot={{ r: 3, fill: LINE, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(columns)}</p>
        </>
      )}
    </section>
  );
}
