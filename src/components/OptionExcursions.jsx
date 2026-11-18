'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useSWR from 'swr';
import { valueTicks } from '@/lib/chartTicks';
import { fetchJson } from '@/lib/fetchJson';
import { formatProfitLoss } from '@/lib/format';
import { DETECTED_MAX_BARS, POST_EXIT_MIN } from '@/lib/setups/settings';
import { EDGE_MINUTES_HOLD } from '@/lib/tradeWindow';

const theme = (name) => `rgb(var(--color-${name}))`;
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const orDash = (format) => (value) => (value === null ? '–' : format(value));
const pct = orDash(percent.format);
const inR = orDash((r) => `${r.toFixed(1)}R`);
const pts = orDash((p) => p.toFixed(2));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const bandLabel = ({ from, to }) => (to === null ? `${percent.format(from)}+` : `${percent.format(from)}–${percent.format(to)}`);

const EXCLUDED_TEXT = [
  ['partialCoverage', 'with partial bar coverage'],
  ['edgeMinutesOnly', 'mostly edge minutes'],
  ['delta', 'estimated from delta'],
  ['none', 'with no premium figure'],
];

// Who is counted, in words: the trusted set and why each other winner is out,
// or, with the rest taken in, how many that is.
function coverage({ winners, premium }, all, estimates) {
  if (all) {
    const out = premium.excluded.none ? ` (${premium.excluded.none} with no premium figure left out)` : '';
    return (
      `${premium.trades} of ${winners} winners, every one with a premium figure: partial coverage, edge minutes, and ` +
      `delta estimates included, ${estimates} of them estimated from delta${out}.`
    );
  }
  const out = EXCLUDED_TEXT.filter(([key]) => premium.excluded[key] > 0).map(([key, text]) => `${premium.excluded[key]} ${text}`);
  return (
    `${premium.trades} of ${winners} winners in the trusted set: the contract's own bars, a bar every minute, held ` +
    `${EDGE_MINUTES_HOLD} minutes or more.${out.length ? ` Left out: ${out.join(', ')}.` : ''}`
  );
}

function BandTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const band = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="text-sm font-semibold text-gray-900 tabular-nums">{band.trades ? plural(band.trades, 'winner') : 'No winners'}</p>
      <p className="mt-0.5 text-gray-500">{`${bandLabel(band)} of the premium against it`}</p>
    </div>
  );
}

// p50, p75, and p90 rows: the R rows apart by where the stop came from (a
// planned and a derived stop are never pooled), then points for every trade.
function PercentileTable({ label, rows }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            <th scope="col" className="px-3 py-2 text-left font-medium">{label}</th>
            {['Trades', 'Median', 'p75', 'p90'].map((name) => (
              <th key={name} scope="col" className="px-3 py-2 text-right font-medium">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(({ name, trades, percentiles, format }) => (
            <tr key={name}>
              <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-gray-700">
                {name}
              </th>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{trades}</td>
              {['p50', 'p75', 'p90'].map((key) => (
                <td key={key} className="px-3 py-1.5 text-right tabular-nums text-gray-900">
                  {format(percentiles[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Heat({ heat }) {
  const [all, setAll] = useState(false);
  if (heat.summary.winners === 0) return <p className="text-sm text-gray-500">No winning option trades closed in this range.</p>;

  const summary = all ? heat.summaryAll : heat.summary;
  const { bands, percentiles } = summary.premium;
  const yTicks = valueTicks(0, Math.max(1, ...bands.map((b) => b.trades)), { whole: true });
  const { r, points } = summary.underlying;

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        <input type="checkbox" checked={all} onChange={() => setAll(!all)} />
        Include the rest (partial coverage, edge minutes, delta estimates)
      </label>
      <p className="text-xs text-gray-500">{coverage(summary, all, heat.summary.premium.excluded.delta)}</p>
      {summary.premium.trades > 0 && (
        <>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bands} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap={2} accessibilityLayer>
                <CartesianGrid vertical={false} horizontalValues={yTicks} stroke={theme('gray-200')} />
                <XAxis
                  dataKey="from"
                  tickFormatter={(from) => bandLabel(bands.find((band) => band.from === from))}
                  interval={1}
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
                <Tooltip content={<BandTooltip />} cursor={false} isAnimationActive={false} />
                <Bar dataKey="trades" fill={theme('blue-600')} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500">
            {`Premium against the trade before it worked: median ${pct(percentiles.p50)}, p75 ${pct(percentiles.p75)}, p90 ${pct(percentiles.p90)} of the premium paid.`}
          </p>
        </>
      )}
      <PercentileTable
        label="Underlying heat on winners"
        rows={[
          { name: 'Planned stop (R)', ...r.plan, format: inR },
          { name: 'Derived stop (R)', ...r.derived, format: inR },
          ...points.map((row) => ({ name: `${row.symbol} (points)`, ...row, format: pts })),
        ]}
      />
      {summary.underlying.excluded.edgeMinutesOnly > 0 && (
        <p className="text-xs text-gray-500">
          {`Left out of the underlying heat: ${summary.underlying.excluded.edgeMinutesOnly} mostly edge minutes.`}
        </p>
      )}
      <p className="text-xs text-gray-500">
        Even past the trusted set&apos;s cut, the fill and exit minutes hold prices from before the fill and after the
        exit, so heat can read a little high.
      </p>
    </div>
  );
}

function AfterExit({ summary }) {
  if (summary.trades === 0) return <p className="text-sm text-gray-500">No option exits to measure in this range.</p>;
  return (
    <div className="space-y-3">
      <PercentileTable
        label="After the exit"
        rows={[
          { name: 'Planned stop (R)', ...summary.r.plan, format: inR },
          { name: 'Derived stop (R)', ...summary.r.derived, format: inR },
          ...summary.points.map((row) => ({ name: `${row.symbol} (points)`, ...row, format: pts })),
        ]}
      />
      <p className="text-xs text-gray-500">
        {`T1 reached within ${POST_EXIT_MIN} minutes after the exit: ${summary.t1.reached} of the ${plural(summary.t1.judged, 'exit')} whose day had a T1 and that exited short of it.`}
      </p>
    </div>
  );
}

const TIMING_NAMES = { early: 'Early', on: 'On the trigger', late: 'Late', none: 'No trigger' };

// [rules-v3 8.9] Entry timing: trades and net P/L by when each entry came
// against its setup's trigger bar, then the underlying's heat per group, in
// points per underlying and in R by where the stop came from (rows with no
// trades are left out of the heat).
function EntryTiming({ timing }) {
  if (timing.groups.every((group) => group.trades === 0) && timing.untimed === 0) {
    return <p className="text-sm text-gray-500">No option entries to time in this range.</p>;
  }
  // Per timing group: a points row for each underlying, then an R row for each
  // stop source (planned, derived) that had trades.
  const heatRows = timing.groups.flatMap(({ timing: name, heatPoints, heatR }) => [
    ...heatPoints.map((row) => ({ name: `${TIMING_NAMES[name]}: ${row.symbol} (points)`, ...row, format: pts })),
    ...[
      ['plan', 'planned stop'],
      ['derived', 'derived stop'],
    ]
      .filter(([source]) => heatR[source].trades > 0)
      .map(([source, words]) => ({ name: `${TIMING_NAMES[name]}: ${words} (R)`, ...heatR[source], format: inR })),
  ]);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table aria-label="Entry timing" className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th scope="col" className="px-3 py-2 text-left font-medium">Entry</th>
              {['Trades', 'Net P/L'].map((name) => (
                <th key={name} scope="col" className="px-3 py-2 text-right font-medium">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {timing.groups.map(({ timing: name, trades, netPnl }) => (
              <tr key={name}>
                <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-gray-700">
                  {TIMING_NAMES[name]}
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{trades}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{formatProfitLoss(netPnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {heatRows.length > 0 && <PercentileTable label="Heat by entry timing" rows={heatRows} />}
      {timing.untimed > 0 && (
        <p className="text-xs text-gray-500">{`${plural(timing.untimed, 'trade')} couldn't be timed: no bars, or a three-gate strategy with no levels stored.`}</p>
      )}
    </div>
  );
}

// Heat on winners, after the exit, and entry timing (rules-v3 section 8, items
// 8, 3, and 9), for the page's mode and year: measured on request, since the route reads
// Alpaca's bars for every option trade. Heat is how far a winning trade went
// against the trader on the way, on its premium (the trusted set by default,
// the rest behind a toggle) and on the underlying; after the exit is how far
// the underlying ran on in the trade's direction.
export default function OptionExcursions({ mode, year }) {
  const [requested, setRequested] = useState(false);
  const key = requested ? `/api/insights/option-excursions?${new URLSearchParams({ mode, year })}` : null;
  const { data, error, isLoading } = useSWR(key, fetchJson, { revalidateOnFocus: false });

  let body;
  if (!requested) {
    body = (
      <button
        type="button"
        onClick={() => setRequested(true)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        Measure heat and after the exit
      </button>
    );
  } else if (error) {
    body = (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  } else if (isLoading || !data) {
    body = <p className="text-sm text-gray-500">Measuring each trade on its bars…</p>;
  } else {
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700">Heat on winners</h3>
          <Heat heat={data.heat} />
        </section>
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700">After the exit</h3>
          <p className="text-xs text-gray-500">
            {`How far the underlying ran on in the trade's direction in the ${POST_EXIT_MIN} minutes after each option exit.`}
          </p>
          <AfterExit summary={data.afterExit.summary} />
        </section>
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700">Entry timing</h3>
          <p className="text-xs text-gray-500">
            {`Each entry against its setup's trigger bar: the strategy's own detector, else the nearest setup detected the trade's way. On the trigger: filled before the bar after it closed. Late: 1 to ${DETECTED_MAX_BARS} bars after. Early: the trigger bar closed after the fill, within ${DETECTED_MAX_BARS} bars, the entered-before-confirmation mistake. Heat is how far the underlying went against the trade while it was open.`}
          </p>
          <EntryTiming timing={data.timing} />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Option trades only, measured on their bars when asked; it follows the page&apos;s Mode and Year only. Points are on
        each underlying, kept apart by symbol; R is from a stop on the underlying, planned or derived, never pooled.
      </p>
      {body}
    </div>
  );
}
