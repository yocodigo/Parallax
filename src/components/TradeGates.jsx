'use client';

import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { MET, MISSED } from '@/lib/setups/gates';

// The section 8 table's order; `size` only appears for an option trade
// (gradeGates only grades it there).
const GATE_ORDER = ['window', 'size', 'direction', 'entry', 'location', 'stop', 'target', 'state'];

const GATE_LABELS = {
  window: 'Window',
  size: 'Size',
  direction: 'Direction',
  entry: 'Entry',
  location: 'Location',
  stop: 'Stop',
  target: 'Target',
  state: 'State',
};

const BADGE_STYLES = {
  [MET]: 'bg-green-50 text-green-700',
  [MISSED]: 'bg-red-50 text-red-700',
};
const UNKNOWN_STYLE = 'bg-gray-100 text-gray-500';

const RESULT_WORDS = { [MET]: 'OK', [MISSED]: 'missed' };

function Gate({ name, result }) {
  return (
    <span className={`rounded px-1.5 py-0.5 ${BADGE_STYLES[result] ?? UNKNOWN_STYLE}`}>
      {`${GATE_LABELS[name]} ${RESULT_WORDS[result] ?? '?'}`}
    </span>
  );
}

// A recorded trade's pre-entry gates (section 8), graded from its bars, the
// day's plan, and its own plan entry.
export default function TradeGates({ tradeId }) {
  const { data, error, isLoading } = useSWR(`/api/trades/${tradeId}/gates`, fetchJson, {
    revalidateOnFocus: false,
  });

  if (isLoading) return <p className="text-xs text-gray-500">Loading gates…</p>;
  if (error) return <p className="text-xs text-red-700">{error.message}</p>;

  const { gates, reason } = data;
  if (!gates) return <p className="text-xs text-gray-500">{reason ?? 'No gates to grade for this trade.'}</p>;

  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {GATE_ORDER.filter((name) => gates[name]).map((name) => (
        <Gate key={name} name={name} result={gates[name]} />
      ))}
    </div>
  );
}
