'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ROLL, rollingCorrelation } from '@/lib/correlation';
import { inputClass } from './Field';

// Grid, axes, and tooltip in the theme's colors, so they follow dark mode.
const theme = (name) => `rgb(var(--color-${name}))`;

// SPY against QQQ when both are loaded, else the first two symbols.
function defaultPair(symbols) {
  return symbols.includes('SPY') && symbols.includes('QQQ') ? ['SPY', 'QQQ'] : [symbols[0], symbols[1]];
}

// The correlation of two symbols' returns over the trailing ROLL bars, through
// time: shows when a relationship held and when it broke, which the matrix's
// single number hides. `series` is the date-keyed price rows of /api/bars.
export default function RollingCorrelation({ series, symbols }) {
  const [choice, setChoice] = useState(null);
  const [first, second] = choice && choice.every((s) => symbols.includes(s)) ? choice : defaultPair(symbols);

  const points = useMemo(
    () => (symbols.length > 1 ? rollingCorrelation(series, first, second) : []),
    [series, symbols.length, first, second]
  );

  if (symbols.length < 2) return null;

  const hasLine = points.some((p) => p.correlation !== null);
  const select = (label, value, onChange) => (
    <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
      {label}
      <select value={value} onChange={onChange} className={`${inputClass} w-24 py-1`}>
        {symbols.map((symbol) => (
          <option key={symbol} value={symbol}>
            {symbol}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-gray-700">{`Rolling correlation (${ROLL} bars)`}</h2>
        {select('First symbol', first, (e) => setChoice([e.target.value, second]))}
        {select('Second symbol', second, (e) => setChoice([first, e.target.value]))}
      </div>

      {hasLine ? (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme('gray-200')} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: theme('gray-500') }} minTickGap={40} stroke={theme('gray-400')} />
              <YAxis domain={[-1, 1]} tick={{ fontSize: 11, fill: theme('gray-500') }} stroke={theme('gray-400')} />
              <Tooltip
                formatter={(v) => Number(v).toFixed(2)}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 6,
                  backgroundColor: theme('white'),
                  borderColor: theme('gray-200'),
                }}
                labelStyle={{ color: theme('gray-900') }}
              />
              <ReferenceLine y={0} stroke={theme('gray-400')} />
              <Line
                type="monotone"
                dataKey="correlation"
                name={`${first} / ${second}`}
                stroke={theme('blue-600')}
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-gray-500">{`Needs more than ${ROLL} bars; load a longer window or a longer timeframe.`}</p>
      )}
    </div>
  );
}
