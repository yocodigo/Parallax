'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import CorrelationHeatmap from './CorrelationHeatmap';
import { rebaseSeries, rebasedLabel, relativeLabel, relativeStrength } from '@/lib/bars';
import { TIMEFRAMES, windowsFor, clampWindow} from '@/lib/timeframes';

const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];

// Grid, axes, and tooltip in the theme's colors, so they follow dark mode.
// Recharts passes these to SVG attributes and inline styles, where var() works.
const theme = (name) => `rgb(var(--color-${name}))`;

// Group timeframes for <optgroup> rendering, preserving table order.
const TIMEFRAME_GROUPS = TIMEFRAMES.reduce((groups, tf) => {
  const g = groups.find((x) => x.label === tf.group);
  if (g) g.options.push(tf);
  else groups.push({ label: tf.group, options: [tf] });
  return groups;
}, []);

export default function PriceChart() {
  const [input, setInput] = useState('AAPL,MSFT,SPY');
  const [symbols, setSymbols] = useState('AAPL,MSFT,SPY');
  const [timeframe, setTimeframe] = useState('1Day');
  const [days, setDays] = useState(90);
  // 'percent' (each line's own change) or 'relative' (minus the benchmark's).
  const [view, setView] = useState('percent');
  const [benchmarkChoice, setBenchmarkChoice] = useState('SPY');
  // Symbols whose line is switched off. Hiding a line only hides it: the
  // others stay rebased to the same window.
  const [hidden, setHidden] = useState(() => new Set());

  const toggleLine = (symbol) =>
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(symbol)) next.add(symbol);
      return next;
    });

  const validWindows = windowsFor(timeframe);

  // Update timeframe and window together so no render (and no request) ever
  // pairs a timeframe with a window it doesn't allow.
  const changeTimeframe = (next) => {
    setTimeframe(next);
    setDays((current) => clampWindow(next, current));
  };

  const { data, error, isLoading } = useSWR(
    `/api/bars?symbols=${encodeURIComponent(symbols)}&days=${days}&timeframe=${timeframe}`,
    fetchJson,
    { revalidateOnFocus: false }
  );

  const rebased = useMemo(
    () => (data?.series ? rebaseSeries(data.series, data.symbols) : []),
    [data]
  );

  // SPY unless it isn't loaded or the choice dropped out, then the first symbol.
  const benchmark = data?.symbols?.includes(benchmarkChoice) ? benchmarkChoice : data?.symbols?.[0];

  const relative = useMemo(
    () => (data?.symbols ? relativeStrength(rebased, data.symbols, benchmark) : []),
    [data, rebased, benchmark]
  );
  const showRelative = view === 'relative';

  const apply = () => setSymbols(input);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="symbols" className="text-xs font-medium text-gray-500">
            Symbols
          </label>
          <input
            id="symbols"
            suppressHydrationWarning
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
            placeholder="AAPL,MSFT,SPY"
            className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="timeframe" className="text-xs font-medium text-gray-500">Timeframe</label>
          <select
            id="timeframe"
            suppressHydrationWarning
            value={timeframe}
            onChange={(e) => changeTimeframe(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            {TIMEFRAME_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="days" className="text-xs font-medium text-gray-500">
            Window
          </label>
          <select
            id="days"
            suppressHydrationWarning
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            {validWindows.map((w) => (
              <option key={w.days} value={w.days}>{w.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={apply}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Load
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error.message}
        </div>
      )}

      {isLoading && (
        <div className="text-sm text-gray-500">Loading bars…</div>
      )}

      {data?.summary?.length > 0 && (
         <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
           {data.summary.map((s) => (
             <div key={s.symbol} className="rounded-lg border border-gray-200 bg-white p-3">
               <div className="text-xs font-medium text-gray-500">{s.symbol}</div>
               <div className="mt-1 text-lg font-semibold tabular-nums">${s.last.toFixed(2)}</div>
               <div className={`text-xs tabular-nums ${s.changePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                 {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}% over window
               </div>
             </div>
           ))}
          </div>
       )}

      {data?.correlation && Object.keys(data.correlation).length > 1 && (
        <CorrelationHeatmap matrix={data.correlation} timeframe={data.timeframe} />
      )}

      {data?.series?.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="flex gap-1" role="group" aria-label="Chart view">
              {[
                ['percent', 'Percent change'],
                ['relative', 'Relative strength'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={`rounded-md border px-3 py-1 text-xs font-medium ${
                    view === value
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {showRelative && (
              <div className="flex items-center gap-2">
                <label htmlFor="benchmark" className="text-xs font-medium text-gray-500">
                  Benchmark
                </label>
                <select
                  id="benchmark"
                  value={benchmark}
                  onChange={(e) => setBenchmarkChoice(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                >
                  {data.symbols.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {/* Not Recharts' Legend: its entries can't be buttons. */}
          <div className="mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {data.symbols.map((symbol, i) => {
              const on = !hidden.has(symbol);
              return (
                <button
                  key={symbol}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleLine(symbol)}
                  className={`flex items-center gap-1.5 text-xs ${on ? 'text-gray-700' : 'text-gray-400 line-through'}`}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: on ? COLORS[i % COLORS.length] : theme('gray-400') }}
                  />
                  {symbol}
                </button>
              );
            })}
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={showRelative ? relative : rebased} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme('gray-200')} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: theme('gray-500') }}
                  minTickGap={40}
                  stroke={theme('gray-400')}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: theme('gray-500') }}
                  domain={['auto', 'auto']}
                  stroke={theme('gray-400')}
                  // Percentage points in the relative view are still measured in percent.
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  // item.payload is the rebased row, which carries the actual prices.
                  formatter={(v, name, item) =>
                    (showRelative ? relativeLabel : rebasedLabel)(Number(v), item.payload.prices[name])
                  }
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    backgroundColor: theme('white'),
                    borderColor: theme('gray-200'),
                  }}
                  labelStyle={{ color: theme('gray-900') }}
                />
                <ReferenceLine y={0} stroke={theme('gray-400')} />
                {data.symbols.map((symbol, i) => (
                  <Line
                    key={symbol}
                    type="monotone"
                    dataKey={symbol}
                    stroke={COLORS[i % COLORS.length]}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                    hide={hidden.has(symbol)}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {data?.window && (
        <p className="text-xs text-gray-400">
          {data.timeframe} bars from Alpaca IEX feed · {data.window.start} to {data.window.end}
        </p>
      )}
    </div>
  );
}
