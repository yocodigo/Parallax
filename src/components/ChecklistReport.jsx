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

const rTone = (r) => (r === null ? 'text-gray-400' : r < 0 ? 'text-red-700' : 'text-green-700');
// An average with no trades behind it is shown as a dash, not 0R.
const showR = (r) => (r === null ? '—' : formatR(r));

function Th({ children, left }) {
  return <th className={`py-1 font-medium ${left ? '' : 'text-right'}`}>{children}</th>;
}

function GroupRow({ label, group }) {
  return (
    <tr>
      <td className="py-1.5 text-gray-800">{label}</td>
      <td className="py-1.5 text-right text-gray-600">{group.trades}</td>
      <td className={`py-1.5 text-right font-medium ${rTone(group.trades ? group.totalR : null)}`}>
        {group.trades ? formatR(group.totalR) : '—'}
      </td>
      <td className={`py-1.5 text-right ${rTone(group.averageR)}`}>{showR(group.averageR)}</td>
    </tr>
  );
}

// Whether following the entry checklist pays: trades with every rule met
// against those entered anyway, and per rule how often it was skipped.
export default function ChecklistReport() {
  const [mode, setMode] = useState('');
  const { data, error, isLoading } = useSWR(
    `/api/insights/checklist${mode ? `?mode=${mode}` : ''}`,
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
        No closed trades with a checklist yet. Pick a strategy when you write a plan, answer its checklist at
        entry, and close the trade to see whether following your rules pays.
      </p>
    );
  } else {
    body = (
      <>
        <table aria-label="Checklist followed or not" className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <Th left>Entry</Th>
              <Th>Trades</Th>
              <Th>Total R</Th>
              <Th>Average R</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <GroupRow label="Every rule met" group={data.followed} />
            <GroupRow label="Entered anyway" group={data.broken} />
          </tbody>
        </table>

        <table aria-label="Rules" className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <Th left>Rule</Th>
              <Th>Skipped</Th>
              <Th>Average R skipped</Th>
              <Th>Average R met</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.rules.map((rule) => (
              <tr key={rule.ruleId ?? `text:${rule.ruleText}`}>
                <td className="py-1.5 text-gray-800">{rule.ruleText}</td>
                <td className="py-1.5 text-right text-gray-600">{`${rule.skipped} of ${rule.checked}`}</td>
                <td className={`py-1.5 text-right ${rTone(rule.skippedAverageR)}`}>{showR(rule.skippedAverageR)}</td>
                <td className={`py-1.5 text-right ${rTone(rule.metAverageR)}`}>{showR(rule.metAverageR)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-gray-500">
          From {data.trades} closed {data.trades === 1 ? 'trade' : 'trades'} entered through a checklist.
        </p>
      </>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-gray-700">Entry checklist</h2>
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
