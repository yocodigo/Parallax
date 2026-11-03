'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { monthColumns, valueTicks } from '@/lib/chartTicks';
import { formatProfitLoss } from '@/lib/format';

const theme = (name) => `rgb(var(--color-${name}))`;

// Gains green, losses red: the app's P/L colors. Fixed hex rather than theme
// variables, because the dark theme would swap 600 for the 400 shades, too light
// for a mark on the dark card; these two read on both cards (green 3.3:1 and
// red 4.8:1 against white, 5.4:1 and 3.7:1 against gray-900, above the 3:1
// graphics need). Red and green are hard to
// tell apart with red-green color blindness, so the sign is never left to color:
// gains rise from the zero line and losses hang below it.
const GAIN = '#16a34a';
const LOSS = '#dc2626';

// Axis ticks: "$0", "$500", "$1.5K", "-$200".
const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
// Cap labels: "+$420", "-$1,310".
const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  signDisplay: 'always',
});
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fullMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parseMonth = (key) => key.split('-').map(Number);
const monthName = (key, withYear) => {
  const [year, month] = parseMonth(key);
  return withYear ? `${MONTH_NAMES[month - 1]} ${year}` : MONTH_NAMES[month - 1];
};
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// The best month if any gained, and the worst if any lost.
function extremes(months) {
  const best = months.reduce((a, b) => (b.netPnl > a.netPnl ? b : a), months[0]);
  const worst = months.reduce((a, b) => (b.netPnl < a.netPnl ? b : a), months[0]);
  return { best: best?.netPnl > 0 ? best : null, worst: worst?.netPnl < 0 ? worst : null };
}

// The months in words: the chart's text alternative, shown to everyone.
function summary(months) {
  const first = months[0].month;
  const last = months.at(-1).month;
  const multiYear = parseMonth(first)[0] !== parseMonth(last)[0];
  const span =
    first === last
      ? monthName(first, true)
      : multiYear
        ? `${monthName(first, true)} to ${monthName(last, true)}`
        : `${monthName(first, false)} to ${monthName(last, true)}`;
  const up = months.filter((m) => m.netPnl > 0).length;
  const down = months.filter((m) => m.netPnl < 0).length;
  const { best, worst } = extremes(months);
  const parts = [`${span}: ${plural(up, 'month')} up, ${down} down.`];
  if (best) parts.push(`Best: ${monthName(best.month, multiYear)}, ${formatProfitLoss(best.netPnl)}.`);
  if (worst) parts.push(`Worst: ${monthName(worst.month, multiYear)}, ${formatProfitLoss(worst.netPnl)}.`);
  return parts.join(' ');
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function MonthTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { month, netPnl, trades, winRate, fees } = payload[0].payload;
  const [year, monthNumber] = parseMonth(month);
  const name = fullMonth.format(Date.UTC(year, monthNumber - 1, 1));
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      {netPnl === null ? (
        <>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-gray-500">No trades</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatProfitLoss(netPnl)}</p>
          <p className="mt-0.5 text-gray-500">
            {name} · {plural(trades, 'trade')}
          </p>
          <p className="text-gray-500 tabular-nums">
            {Math.round(winRate * 100)}% won · {dollars.format(fees)} in fees
          </p>
        </>
      )}
    </div>
  );
}

// Labels on the best and worst months only, above a gain's cap and below a
// loss's; the tooltip and the sentence under the chart carry the rest. Recharts
// puts y at the column's value end for gains and losses alike.
function capLabel(labelled) {
  return function CapLabel({ viewBox, value, index }) {
    if (!labelled.has(index)) return null;
    const { x, y, width } = viewBox;
    return (
      <text
        x={x + width / 2}
        y={value >= 0 ? y - 6 : y + 6}
        dominantBaseline={value >= 0 ? 'auto' : 'hanging'}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill={theme('gray-700')}
      >
        {wholeDollars.format(value)}
      </text>
    );
  };
}

// The month on one line and, where monthColumns gives one, the year under it,
// so a label is never wider than "Sep" and crowded months still fit.
function monthTick(columns) {
  const byMonth = new Map(columns.map((c) => [c.month, c]));
  return function MonthTick({ x, y, payload }) {
    const { label, year } = byMonth.get(payload.value);
    return (
      <text x={x} y={y} textAnchor="middle" fontSize={11} fill={theme('gray-500')}>
        <tspan x={x} dy="0.71em">
          {label}
        </tspan>
        {year && (
          <tspan x={x} dy="1.3em">
            {year}
          </tspan>
        )}
      </text>
    );
  };
}

// Net P/L of each New York month (the route's `months`), one column a month.
export default function MonthlyPnl({ months }) {
  const columns = monthColumns(months);
  const values = months.map((m) => m.netPnl);
  const yTicks = valueTicks(Math.min(...values), Math.max(...values));
  const { best, worst } = extremes(months);
  const labelled = new Set(
    [best, worst].filter(Boolean).map((m) => columns.findIndex((c) => c.month === m.month))
  );

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Net P/L by month</h2>
        <p className="text-xs text-gray-500">After fees, by the New York month each trade closed in.</p>
      </div>

      {months.length === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={columns} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
                {/* Gridlines on the ticks only, not at the edges of the label room. */}
                <CartesianGrid vertical={false} horizontalValues={yTicks} stroke={theme('gray-200')} />
                <XAxis
                  dataKey="month"
                  // monthColumns picks the labelled months; Recharts shows every one of them.
                  ticks={columns.filter((c) => c.label).map((c) => c.month)}
                  interval={0}
                  // Room for the year's second line when the months cross a year.
                  height={columns.some((c) => c.year) ? 44 : 30}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  tick={monthTick(columns)}
                />
                <YAxis
                  // Round ticks that always take in zero, plus room for the cap labels.
                  ticks={yTicks}
                  domain={[yTicks[0], yTicks.at(-1)]}
                  interval={0}
                  padding={{ top: 18, bottom: 18 }}
                  tickFormatter={(value) => compactMoney.format(value)}
                  width={52}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: theme('gray-500'), style: { fontVariantNumeric: 'tabular-nums' } }}
                />
                <ReferenceLine y={0} stroke={theme('gray-400')} />
                {/* The whole month's slot answers the pointer, not just the column.
                    filterNull off: Recharts otherwise drops a month with no trades
                    (netPnl null), and its "No trades" readout would never show. */}
                <Tooltip content={<MonthTooltip />} cursor={false} filterNull={false} isAnimationActive={false} />
                <Bar
                  dataKey="netPnl"
                  maxBarSize={24}
                  // Rounds the value end: Recharts' "top" is the y side, the value end for losses too.
                  radius={[4, 4, 0, 0]}
                  activeBar={{ fillOpacity: 0.75 }}
                  isAnimationActive={false}
                >
                  {columns.map((column) => (
                    <Cell key={column.month} fill={column.netPnl < 0 ? LOSS : GAIN} />
                  ))}
                  <LabelList dataKey="netPnl" content={capLabel(labelled)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(months)}</p>
        </>
      )}
    </section>
  );
}
