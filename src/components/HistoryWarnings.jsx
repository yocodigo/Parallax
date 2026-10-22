'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { formatR } from '@/lib/format';

const DEBOUNCE_MS = 400;

const SESSION_PARTS = {
  open: 'in the first 30 minutes of the session',
  midday: 'at midday',
  close: 'in the last 30 minutes of the session',
};

// `value`, but only once it has stopped changing for `ms`, so typing a
// symbol asks once rather than once per letter.
function useDebouncedValue(value, ms) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function describe(warning) {
  const average = `averaged ${formatR(warning.averageR)}`;
  switch (warning.rule) {
    case 'symbol':
      return `Your last ${warning.trades} ${warning.symbol} trades ${average}.`;
    case 'side':
      return `Your last ${warning.trades} ${warning.direction} ${warning.assetClass} trades ${average}.`;
    default:
      return `Your last ${warning.trades} entries ${SESSION_PARTS[warning.sessionPart]} ${average}.`;
  }
}

// What the trader's own closed trades say about a plan like this one, shown
// while it's being written. Advisory only: while loading, on an error, or
// with nothing to say, it shows nothing.
export default function HistoryWarnings({ mode, direction, assetClass, symbol }) {
  const query = useDebouncedValue(
    new URLSearchParams({ mode, direction, assetClass, symbol: symbol.trim() }).toString(),
    DEBOUNCE_MS
  );
  const { data } = useSWR(`/api/insights/warnings?${query}`, fetchJson, { revalidateOnFocus: false });

  const warnings = data?.warnings ?? [];
  if (warnings.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">From your history</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {warnings.map((warning) => (
          <li key={warning.rule}>{describe(warning)}</li>
        ))}
      </ul>
    </div>
  );
}
