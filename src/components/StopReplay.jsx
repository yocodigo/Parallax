'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { formatR } from '@/lib/format';
import { inputClass } from './Field';

const MODES = [
  ['', 'All trades'],
  ['live', 'Live'],
  ['paper', 'Paper'],
  ['backtest', 'Backtest'],
];

const RULE_NAMES = { S1: 'S1 · 5m band', S2: 'S2 · 1m structure', S3: 'S3 · time stop' };
const ruleLabel = (rules) => (rules.length === 1 ? RULE_NAMES[rules[0]] : rules.join(' + '));

const rTone = (r) => (r === null ? 'text-gray-400' : r < 0 ? 'text-red-700' : 'text-green-700');
// An average with no trades behind it is shown as a dash, not 0R.
const showR = (r) => (r === null ? '—' : formatR(r));
const showCut = ({ cutBeforeT1, cutBeforeT1Share }) =>
  cutBeforeT1 ? `${cutBeforeT1} (${Math.round(cutBeforeT1Share * 100)}%)` : '0';

function Th({ children, left }) {
  return <th className={`py-1 font-medium ${left ? '' : 'text-right'}`}>{children}</th>;
}

// Which stop rule would have served your closed SPY trades best, replayed on
// SPY 1m bars (setups.md section 5), with R measured against S2's stop.
export default function StopReplay() {
  const [mode, setMode] = useState('');
  const { data, error, isLoading } = useSWR(`/api/insights/stops${mode ? `?mode=${mode}` : ''}`, fetchJson, {
    revalidateOnFocus: false,
  });

  let body;
  if (isLoading) {
    body = <p className="text-sm text-gray-500">Loading…</p>;
  } else if (error) {
    body = (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  } else if (data.replayed === 0) {
    body = (
      <p className="text-sm text-gray-500">
        No closed SPY trades to replay yet. Close an SPY option or stock trade to see how each stop rule would
        have handled it.
      </p>
    );
  } else {
    body = (
      <>
        <table aria-label="Stop rules" className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <Th left>Rules</Th>
              <Th>Trades</Th>
              <Th>Average R</Th>
              <Th>Cut before T1</Th>
              <Th>Average R when cut</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.ruleSets.map((set) => (
              <tr key={set.rules.join('+')}>
                <td className="py-1.5 text-gray-800">{ruleLabel(set.rules)}</td>
                <td className="py-1.5 text-right text-gray-600">{set.trades}</td>
                <td className={`py-1.5 text-right font-medium ${rTone(set.averageR)}`}>{showR(set.averageR)}</td>
                <td className="py-1.5 text-right text-gray-600">{showCut(set)}</td>
                <td className={`py-1.5 text-right ${rTone(set.averageRWhenCut)}`}>{showR(set.averageRWhenCut)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-gray-500">
          {`Replayed ${data.replayed} closed SPY ${data.replayed === 1 ? 'trade' : 'trades'} on SPY 1m bars; ${data.skipped} skipped for missing bars. `}
          R is measured from the fill bar&apos;s close to its far extreme. S3 and T1 come with each day&apos;s fib
          levels.
        </p>
      </>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-gray-700">Stop rules, replayed</h2>
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
