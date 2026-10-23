'use client';

import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { formatContract } from '@/lib/format';
import { EMOTION_LABELS, MISTAKE_LABELS } from '@/lib/journalEntry';
import TradeProgress from './TradeProgress';

export const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);

// "Long 100 AAPL", or "Long 2 SPY 500C exp Jan 16" for an option: enough to
// recognize the trade without opening it.
export const describeTrade = (trade) =>
  [capitalize(trade.direction), trade.quantity, trade.symbol, trade.assetClass === 'option' && formatContract(trade)]
    .filter(Boolean)
    .join(' ');

export default function JournalEntries() {
  const { data, error, isLoading } = useSWR('/api/journal', fetchJson, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading journal…</div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  }

  const entries = data?.entries || [];
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        No journal entries yet.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline gap-2 text-xs text-gray-500">
            <span className="font-semibold text-gray-700">{capitalize(entry.kind)}</span>
            {entry.symbol && <span className="font-medium text-gray-800">{entry.symbol}</span>}
            <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
          </div>

          {entry.trade && (
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-2 text-xs tabular-nums text-gray-600">
                <span>{describeTrade(entry.trade)}</span>
                <span className="rounded bg-gray-100 px-1.5">{capitalize(entry.trade.mode)}</span>
              </div>
              {/* Fills are recorded on the plan; reviews of the trade just show where it stands. */}
              <TradeProgress trade={entry.trade} canRecord={entry.kind === 'plan'} />
            </div>
          )}

          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{entry.notes}</p>

          {(entry.emotion || entry.mistakes.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {entry.emotion && (
                <span className="rounded bg-blue-50 px-1.5 text-blue-700">
                  {EMOTION_LABELS[entry.emotion]}
                </span>
              )}
              {entry.mistakes.map((mistake) => (
                <span key={mistake} className="rounded bg-red-50 px-1.5 text-red-700">
                  {MISTAKE_LABELS[mistake]}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
