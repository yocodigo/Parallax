'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatInZone, WRITTEN } from '@/lib/displayZone';
import { fetchJson } from '@/lib/fetchJson';
import { formatContract, formatProfitLoss, formatTradeTime } from '@/lib/format';
import { journalDays } from '@/lib/journalDays';
import { filterJournal, isFiltering, NO_FILTERS } from '@/lib/journalFilters';
import { profitLoss, tradeStatus } from '@/lib/tradeMetrics';
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

function EntryCard({ entry, zone, inTrade = false }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-gray-500">
        <span className="font-semibold text-gray-800">{capitalize(entry.kind)}</span>
        {entry.symbol && <span className="font-semibold text-gray-900">{entry.symbol}</span>}
        <time dateTime={entry.createdAt}>{formatInZone(entry.createdAt, zone, WRITTEN)}</time>
      </div>

      {entry.trade && !inTrade && (
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

// What a trade row says about its result: the P/L once closed, else where it stands.
function resultOf(trade) {
  const status = tradeStatus(trade);
  if (status === 'closed') {
    const pnl = profitLoss(trade);
    return { text: formatProfitLoss(pnl), tone: pnl >= 0 ? 'text-green-700' : 'text-red-700' };
  }
  return { text: status === 'open' ? 'Still open' : 'Not filled', tone: 'text-gray-600' };
}

// One trade on one line (time, contract, mode, result, setup, review status);
// opening it shows the trade's progress once and every entry written about it.
// Whether it is open is kept by the list, since recording a fill can move the
// trade to another day and remount its row.
function TradeRow({ row, zone, strategyName, open, onToggle }) {
  const { trade, entries } = row;
  const result = resultOf(trade);
  const closed = tradeStatus(trade) === 'closed';
  const reviewed = entries.some((entry) => entry.kind === 'review');
  const hasPlan = entries.some((entry) => entry.kind === 'plan');

  return (
    <li className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left text-sm tabular-nums text-gray-800"
      >
        <span className="w-16 text-gray-500">{formatTradeTime(trade.openedAt, zone) || '—'}</span>
        <span className="font-medium">{describeTrade(trade)}</span>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">{capitalize(trade.mode)}</span>
        <span className={`font-medium ${result.tone}`}>{result.text}</span>
        {strategyName && <span className="text-gray-600">{strategyName}</span>}
        {closed && (
          <span className={`ml-auto text-xs ${reviewed ? 'text-gray-500' : 'text-amber-700'}`}>
            {reviewed ? 'Reviewed' : 'Needs review'}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-4 border-t border-gray-200 p-5">
          {/* Fills are recorded on the plan; without one the trade only shows where it stands. */}
          <TradeProgress trade={trade} canRecord={hasPlan && !isDemo()} />
          <ul className="space-y-4">
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} zone={zone} inTrade />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

const selectClass = 'rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900';

// Mode, result, reviewed, and setup narrow the list in the browser.
function Filters({ filters, onChange, strategies }) {
  const select = (key, label, options) => (
    <label className="flex flex-col gap-1 text-xs text-gray-500">
      {label}
      <select value={filters[key]} onChange={(e) => onChange({ ...filters, [key]: e.target.value })} className={selectClass}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      {select('mode', 'Mode', [['all', 'All modes'], ['live', 'Live'], ['paper', 'Paper'], ['backtest', 'Backtest']])}
      {select('result', 'Result', [['all', 'Any result'], ['win', 'Win'], ['loss', 'Loss'], ['scratch', 'Scratch']])}
      {select('reviewed', 'Reviewed', [['all', 'Reviewed or not'], ['reviewed', 'Reviewed'], ['unreviewed', 'Not reviewed']])}
      {select('setup', 'Setup', [
        ['all', 'Any setup'],
        ['none', 'No setup'],
        ...strategies.map((strategy) => [strategy.id, strategy.name]),
      ])}
      {isFiltering(filters) && (
        <button type="button" onClick={() => onChange(NO_FILTERS)} className="pb-1 text-sm text-blue-600 hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );
}

export default function JournalEntries() {
  const zone = useDisplayZone();
  const [shown, setShown] = useState(DAYS_SHOWN);
  const [openTrades, setOpenTrades] = useState(() => new Set());
  const [filters, setFilters] = useState(NO_FILTERS);
  const { data: strategyData } = useSWR('/api/strategies', fetchJson, { revalidateOnFocus: false });
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

  const days = journalDays(filterJournal(entries, filters));
  const toggleTrade = (id) =>
    setOpenTrades((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const strategyNames = new Map((strategyData?.strategies ?? []).map((strategy) => [strategy.id, strategy.name]));

  return (
    <div>
      <Filters filters={filters} onChange={setFilters} strategies={strategyData?.strategies ?? []} />
      {days.length === 0 && <p className="text-sm text-gray-500">No entries match these filters.</p>}
      <div className="space-y-8">
        {days.slice(0, shown).map((day) => (
          <section key={day.day} aria-labelledby={`day-${day.day}`}>
            <h2 id={`day-${day.day}`} className="text-base font-semibold text-gray-900">
              {formatDay(day.day)}
            </h2>
            <p className="mt-0.5 text-sm tabular-nums text-gray-500">{summarizeDay(day.summary)}</p>
            <ul className="mt-3 space-y-3">
              {day.items.map((item) =>
                item.type === 'trade' ? (
                  <TradeRow
                    key={item.trade.id}
                    row={item}
                    zone={zone}
                    strategyName={strategyNames.get(item.trade.strategyId)}
                    open={openTrades.has(item.trade.id)}
                    onToggle={() => toggleTrade(item.trade.id)}
                  />
                ) : (
                  <EntryCard key={item.entry.id} entry={item.entry} zone={zone} />
                )
              )}
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
    </div>
  );
}
