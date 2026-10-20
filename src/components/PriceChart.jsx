'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import CorrelationHeatmap from './CorrelationHeatmap';
import { TIMEFRAMES, windowsFor, clampWindow} from '@/lib/timeframes';

const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];

// Group timeframes for <optgroup> rendering, preserving table order.
const TIMEFRAME_GROUPS = TIMEFRAMES.reduce((groups, tf) => {
  const g = groups.find((x) => x.label === tf.group);
  if (g) g.options.push(tf);
  else groups.push({ label: tf.group, options: [tf] });
  return groups;
}, []);

const fetcher = async (url) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
};

export default function PriceChart() {
  const [input, setInput] = useState('AAPL,MSFT,SPY');
  const [symbols, setSymbols] = useState('AAPL,MSFT,SPY');
  const [timeframe, setTimeframe] = useState('1Day');
  const [days, setDays] = useState(90);

  const validWindows = windowsFor(timeframe);

  // If the current window exceeds the new timeframe's cap, snap it down to
  // the largest that fits. Keeps the picker and request always valid.
  useEffect(() => {
    setDays(clampWindow(timeframe, days));
  }, [timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, isLoading } = useSWR(
    `/api/bars?symbols=${encodeURIComponent(symbols)}&days=${days}&timeframe=${timeframe}`,
    fetcher,
    { revalidateOnFocus: false }
  );

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
            onChange={(e) => setTimeframe(e.target.value)}
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
        <div className="h-96 rounded-lg border border-gray-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                minTickGap={40}
                stroke="#9ca3af"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                domain={['auto', 'auto']}
                stroke="#9ca3af"
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                formatter={(v) => `$${Number(v).toFixed(2)}`}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {data.symbols.map((symbol, i) => (
                <Line
                  key={symbol}
                  type="monotone"
                  dataKey={symbol}
                  stroke={COLORS[i % COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
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
