'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { inputClass } from './Field';

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

const LEVEL_LABELS = {
  prior_day_high: 'Prior day high',
  prior_day_low: 'Prior day low',
  prior_week_high: 'Prior week high',
  prior_week_low: 'Prior week low',
  prior_month_high: 'Prior month high',
  prior_month_low: 'Prior month low',
  asia_high: 'Asia high',
  asia_low: 'Asia low',
  london_high: 'London high',
  london_low: 'London low',
  premarket_high: 'Premarket high',
  premarket_low: 'Premarket low',
  fib_50: 'Working fib 50%',
  fib_100: 'Working fib 100%',
  htf_fib_50: 'HTF fib 50%',
  htf_fib_100: 'HTF fib 100%',
};

const COLUMNS = ['Level', 'Sessions', 'Reached', 'Rejected', 'Ran through', 'Oscillating', 'Neither', 'Undecided'];

function Results({ data }) {
  if (data.kinds.length === 0) {
    return <p className="text-sm text-gray-500">No finished sessions with bars and a level to judge in this year.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        {`${data.symbol}, ${data.sessions} finished sessions of ${data.year}. Reached is the share of the sessions that had the level; the outcomes count those touches (the first of the session, to the close).`}
      </p>
      <div className="overflow-x-auto">
        <table aria-label="Level reactions" className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              {COLUMNS.map((name, k) => (
                <th key={name} scope="col" className={`px-3 py-2 font-medium ${k === 0 ? 'text-left' : 'text-right'}`}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.kinds.map((row) => (
              <tr key={row.kind}>
                <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-gray-700">
                  {LEVEL_LABELS[row.kind] ?? row.kind}
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{row.sessions}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">
                  {percent.format(row.reached / row.sessions)}
                </td>
                {[row.rejected, row.ranThrough, row.oscillating, row.none, row.undecided].map((count, k) => (
                  <td key={k} className="px-3 py-1.5 text-right tabular-nums text-gray-900">
                    {count}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// How price reacted to the levels known at the open (rules-v3 8.10) for one symbol over the
// page's year, from Alpaca's minute bars: asked for when the button is pressed, never stored.
// `symbols` are the ones traded; SPY, the default, is always offered.
export default function LevelReactions({ year, symbols }) {
  const [symbol, setSymbol] = useState('SPY');
  // The symbol and year the button was last pressed for: changing either asks again.
  const [asked, setAsked] = useState(null);
  const current = `${symbol}|${year}`;
  const requested = asked === current;
  const options = ['SPY', ...symbols.filter((s) => s !== 'SPY')];
  const key = requested ? `/api/insights/level-reactions?${new URLSearchParams({ symbol, year })}` : null;
  const { data, error, isLoading } = useSWR(key, fetchJson, { revalidateOnFocus: false });

  if (year === 'all') {
    return <p className="text-sm text-gray-500">Pick a single year to measure level reactions: a year of minute bars is a lot already.</p>;
  }

  let body = null;
  if (requested && error) {
    body = (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  } else if (requested && (isLoading || !data)) {
    body = <p className="text-sm text-gray-500">Reading a year of minute bars…</p>;
  } else if (requested) {
    body = <Results data={data} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        One symbol at a time, every regular session of the page&apos;s year. The levels are the ones fixed before the open: the
        prior day, week, and month highs and lows, and that day&apos;s plan for the symbol (overnight levels and fibs).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Symbol
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className={inputClass}
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setAsked(current)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Measure level reactions
        </button>
      </div>
      {body}
    </div>
  );
}
