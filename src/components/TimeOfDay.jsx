'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { valueTicks } from '@/lib/chartTicks';
import { formatProfitLoss } from '@/lib/format';
import { LOCKOUTS } from '@/lib/setups/settings';

const theme = (name) => `rgb(var(--color-${name}))`;

// Gains green, losses red, as on the monthly chart (see the note there on why
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

// The session the buckets cover, in minutes of the New York day.
const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const BUCKET = 30;

const toMinutes = (time) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};
// "9:30", "1:00": a 12-hour clock without am or pm, since every label is New York session time.
const clock = (minutes) => {
  const hour = Math.floor(minutes / 60) % 12 || 12;
  return `${hour}:${String(minutes % 60).padStart(2, '0')}`;
};
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const lockouts = LOCKOUTS.map(([from, to]) => [toMinutes(from), toMinutes(to)]);
// A lockout touches a half hour when they share some time; one ending exactly where it starts doesn't.
const inLockout = (start) => lockouts.some(([from, to]) => from < start + BUCKET && to > start);

// The day in words: the chart's text alternative, shown to everyone.
function summary(session, outside) {
  const trades = session.reduce((total, b) => total + b.trades, 0);
  const traded = session.filter((b) => b.trades > 0);
  const best = traded.reduce((a, b) => (b.netPnl > a.netPnl ? b : a), traded[0]);
  const worst = traded.reduce((a, b) => (b.netPnl < a.netPnl ? b : a), traded[0]);
  const parts = [`${plural(trades, 'trade')} entered from ${clock(OPEN)} to ${clock(CLOSE)} ET.`];
  if (best.netPnl > 0) parts.push(`Best half hour: ${clock(toMinutes(best.start))}, ${formatProfitLoss(best.netPnl)}.`);
  if (worst.netPnl < 0) parts.push(`Worst: ${clock(toMinutes(worst.start))}, ${formatProfitLoss(worst.netPnl)}.`);
  if (outside?.trades > 0) {
    parts.push(`Outside the session: ${plural(outside.trades, 'trade')}, ${formatProfitLoss(outside.netPnl)}.`);
  }
  return parts.join(' ');
}

// The hover and keyboard readout: the value first, then what it belongs to.
export function TimeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { start, trades, netPnl, winRate, netExpectancy } = payload[0].payload;
  const from = toMinutes(start);
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold text-gray-900 tabular-nums">
        {trades > 0 ? formatProfitLoss(netPnl) : 'No trades'}
      </p>
      <p className="mt-0.5 text-gray-500">
        {clock(from)} to {clock(from + BUCKET)} ET
      </p>
      {trades > 0 && (
        <p className="text-gray-500 tabular-nums">
          {plural(trades, 'trade')} · {percent.format(winRate)} win rate · {formatProfitLoss(netExpectancy)} per trade
        </p>
      )}
      {inLockout(from) && <p className="text-gray-500">Overlaps a lockout window</p>}
    </div>
  );
}

// Net P/L by the half hour of the session each trade was entered in (the
// route's `timeOfDay`), with the lockout windows shaded behind the bars. The
// lockouts are entry rules, which is why the bars use the entry time too.
export default function TimeOfDay({ buckets }) {
  const session = buckets.filter((b) => b.start !== 'outside');
  const outside = buckets.find((b) => b.start === 'outside');
  const trades = buckets.reduce((total, b) => total + b.trades, 0);
  const yTicks = valueTicks(
    Math.min(...session.map((b) => b.netPnl)),
    Math.max(...session.map((b) => b.netPnl))
  );
  // A label at the open and on each hour; the half hours between stay unlabelled.
  const labelled = session.filter((b) => b.start === '09:30' || b.start.endsWith(':00')).map((b) => b.start);

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Results by time of day</h2>
        <p className="text-xs text-gray-500">
          Net P/L by the half hour of entry, New York time. Shaded: lockout windows, when entries are off limits.
        </p>
      </div>

      {trades === 0 ? (
        <p className="text-sm text-gray-500">No closed trades in this range.</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={session} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} horizontalValues={yTicks} stroke={theme('gray-200')} />
                <XAxis
                  dataKey="start"
                  ticks={labelled}
                  tickFormatter={(start) => clock(toMinutes(start))}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11, fill: theme('gray-500') }}
                />
                {/* The lockouts are quarter hours and hours, which the half-hour slots can't
                    hold, so they sit on a clock axis of their own. The slots share the plot
                    width equally and the session is 390 minutes, so the two line up. */}
                {/* allowDataOverflow keeps the domain as given: otherwise Recharts widens it to
                    take in the data's own indexes, starting the clock at midnight. */}
                <XAxis xAxisId="clock" type="number" domain={[OPEN, CLOSE]} allowDataOverflow hide />
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
                {lockouts.map(([from, to]) => (
                  <ReferenceArea
                    key={from}
                    xAxisId="clock"
                    x1={from}
                    x2={to}
                    fill={theme('gray-400')}
                    fillOpacity={0.25}
                    stroke="none"
                  />
                ))}
                <ReferenceLine y={0} stroke={theme('gray-400')} />
                {/* The whole slot answers the pointer, so an empty half hour can say so. */}
                <Tooltip content={<TimeTooltip />} cursor={false} isAnimationActive={false} />
                <Bar dataKey="netPnl" maxBarSize={24} radius={[4, 4, 0, 0]} activeBar={{ fillOpacity: 0.75 }} isAnimationActive={false}>
                  {session.map((b) => (
                    <Cell key={b.start} fill={b.netPnl < 0 ? LOSS : GAIN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">{summary(session, outside)}</p>
        </>
      )}
    </section>
  );
}
