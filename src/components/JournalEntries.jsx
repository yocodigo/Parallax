'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatInZone, WRITTEN } from '@/lib/displayZone';
import { fetchJson } from '@/lib/fetchJson';
import { formatContract, formatProfitLoss } from '@/lib/format';
import { journalDays } from '@/lib/journalDays';
import { EMOTION_LABELS, MISTAKE_LABELS } from '@/lib/journalEntry';
import EntryCoaching from './EntryCoaching';
import EntryDelete from './EntryDelete';
import TradeProgress from './TradeProgress';
import useDisplayZone from './useDisplayZone';
import { isDemo } from '@/lib/demo';

export const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);

// "Long 100 AAPL", or "Long 2 SPY 500C exp Jan 16" for an option: enough to
// recognize the trade without opening it.
export const describeTrade = (trade) =>
  [capitalize(trade.direction), trade.quantity, trade.symbol, trade.assetClass === 'option' && formatContract(trade)]
    .filter(Boolean)
    .join(' ');

const DAYS_SHOWN = 10;

// "Thu, Nov 19, 2026" from a New York date. Built at noon UTC and read in UTC,
// so the zone can't move it a day.
const formatDay = (day) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

function summarizeDay({ tradeCount, closedCount, netPnl, reviewed }) {
  if (tradeCount === 0) return 'No trades';
  const net = closedCount > 0 ? `net ${formatProfitLoss(netPnl)}` : 'none closed';
  return `${tradeCount} ${tradeCount === 1 ? 'trade' : 'trades'} · ${net} · reviewed ${reviewed} of ${closedCount}`;
}

function EntryCard({ entry, zone }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-gray-500">
        <span className="font-semibold text-gray-800">{capitalize(entry.kind)}</span>
        {entry.symbol && <span className="font-semibold text-gray-900">{entry.symbol}</span>}
        <time dateTime={entry.createdAt}>{formatInZone(entry.createdAt, zone, WRITTEN)}</time>
      </div>

      {entry.trade && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium tabular-nums text-gray-800">
            <span>{describeTrade(entry.trade)}</span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">{capitalize(entry.trade.mode)}</span>
          </div>
          {/* Fills are recorded on the plan; reviews of the trade just show where it stands. */}
          <TradeProgress trade={entry.trade} canRecord={entry.kind === 'plan' && !isDemo()} />
        </div>
      )}

      <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">{entry.notes}</p>

      {(entry.emotion || entry.mistakes.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {entry.emotion && (
            <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
              {EMOTION_LABELS[entry.emotion]}
            </span>
          )}
          {entry.mistakes.map((mistake) => (
            <span key={mistake} className="rounded bg-red-50 px-2 py-0.5 text-red-700">
              {MISTAKE_LABELS[mistake]}
            </span>
          ))}
        </div>
      )}

      {entry.kind === 'review' && <EntryCoaching entry={entry} />}

      {!isDemo() && <EntryDelete entry={entry} />}
    </li>
  );
}

export default function JournalEntries() {
  const zone = useDisplayZone();
  const [shown, setShown] = useState(DAYS_SHOWN);
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

  const days = journalDays(entries);

  return (
    <div className="space-y-8">
      {days.slice(0, shown).map((day) => (
        <section key={day.day} aria-labelledby={`day-${day.day}`}>
          <h2 id={`day-${day.day}`} className="text-base font-semibold text-gray-900">
            {formatDay(day.day)}
          </h2>
          <p className="mt-0.5 text-sm tabular-nums text-gray-500">{summarizeDay(day.summary)}</p>
          <ul className="mt-3 space-y-4">
            {day.items.flatMap((item) => (item.type === 'trade' ? item.entries : [item.entry])).map((entry) => (
              <EntryCard key={entry.id} entry={entry} zone={zone} />
            ))}
          </ul>
        </section>
      ))}
      {shown < days.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + DAYS_SHOWN)}
          className="text-sm text-blue-600 hover:underline"
        >
          Show earlier days
        </button>
      )}
    </div>
  );
}
