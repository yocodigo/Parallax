'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { formatR } from '@/lib/format';
import { MISTAKE_LABELS } from '@/lib/journalEntry';
import { inputClass } from './Field';

const MODES = [
  ['', 'All trades'],
  ['live', 'Live'],
  ['paper', 'Paper'],
  ['backtest', 'Backtest'],
];

const rTone = (r) => (r < 0 ? 'text-red-700' : 'text-green-700');

function Baseline({ baseline }) {
  if (baseline.trades === 0) return 'Every closed trade had a mistake tagged.';
  const trades = baseline.trades === 1 ? '1 trade' : `${baseline.trades} trades`;
  return `${trades} with no mistakes averaged ${formatR(baseline.averageR)}.`;
}

// What each tagged mistake has cost in R, costliest first, next to the
// average of trades without mistakes.
export default function MistakeLedger() {
  const [mode, setMode] = useState('');
  const { data, error, isLoading } = useSWR(
    `/api/insights/mistakes${mode ? `?mode=${mode}` : ''}`,
    fetchJson,
    { revalidateOnFocus: false }
  );

  let body;
  if (isLoading) {
    body = <p className="text-sm text-gray-500">Loading…</p>;
  } else if (error) {
    body = (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  } else if (data.trades === 0) {
    body = (
      <p className="text-sm text-gray-500">
        No closed trades yet. Record entries and exits on the journal to see what your mistakes cost.
      </p>
    );
  } else {
    body = (
      <>
        {data.mistakes.length === 0 ? (
          <p className="text-sm text-gray-500">No mistakes tagged on closed trades.</p>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="py-1 font-medium">Mistake</th>
                <th className="py-1 text-right font-medium">Trades</th>
                <th className="py-1 text-right font-medium">Total R</th>
                <th className="py-1 text-right font-medium">Average R</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.mistakes.map((row) => (
                <tr key={row.mistake}>
                  <td className="py-1.5 text-gray-800">{MISTAKE_LABELS[row.mistake] ?? row.mistake}</td>
                  <td className="py-1.5 text-right text-gray-600">{row.trades}</td>
                  <td className={`py-1.5 text-right font-medium ${rTone(row.totalR)}`}>{formatR(row.totalR)}</td>
                  <td className={`py-1.5 text-right ${rTone(row.averageR)}`}>{formatR(row.averageR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-gray-500">
          <Baseline baseline={data.baseline} /> From {data.trades} closed{' '}
          {data.trades === 1 ? 'trade' : 'trades'}.
        </p>
      </>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-gray-700">Mistake cost ledger</h2>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={`${inputClass} w-36`}>
            {MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {body}
    </section>
  );
}
