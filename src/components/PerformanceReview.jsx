'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { apiErrorMessage, fetchJson } from '@/lib/fetchJson';
import { isDemo } from '@/lib/demo';
import { formatProfitLoss } from '@/lib/format';
import { REVIEW_SECTIONS } from '@/lib/reviewSections';
import { inputClass } from './Field';

const buttonClass =
  'rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';

const RANGES = [
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['all', 'All time'],
  ['custom', 'Custom range'],
];

const MODE_NAMES = { live: 'Live', paper: 'Paper', backtest: 'Backtest' };

const writtenFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const alertClass = 'rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800';

// The headline figures, one row per mode that has a closed trade: modes are
// different things (real money, simulated, replayed), so they are never added up.
function StatsTable({ stats }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <caption className="px-4 pt-3 text-left text-xs text-gray-500">
          Closed trades by mode. Win rate is judged on gross P/L; the P/L figures are net of fees.
        </caption>
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th scope="col" className="px-4 py-2 font-medium">Mode</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Trades</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Win rate (gross)</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Total P/L (net)</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Avg P/L per trade (net)</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(stats).map(([mode, s]) => (
            <tr key={mode} className="border-t border-gray-100 tabular-nums">
              <th scope="row" className="px-4 py-2 text-left font-medium text-gray-900">{MODE_NAMES[mode] ?? mode}</th>
              <td className="px-4 py-2 text-right">{s.trades}</td>
              <td className="px-4 py-2 text-right">{s.winRatePct === null ? '—' : `${s.winRatePct.toFixed(1)}%`}</td>
              <td className="px-4 py-2 text-right">{formatProfitLoss(s.netPnl)}</td>
              <td className="px-4 py-2 text-right">{s.avgNetPnl === null ? '—' : formatProfitLoss(s.avgNetPnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewText({ review }) {
  const covers = review.rangeFrom ? `${review.rangeFrom} to ${review.rangeTo}` : 'all time';
  return (
    <div className="space-y-5">
      {REVIEW_SECTIONS.map(({ key, title }) => (
        <section key={key}>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {/* Plain text, with line breaks kept. */}
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-gray-800">{review.sections[key]}</p>
        </section>
      ))}
      <p className="text-xs text-gray-500">
        Written {writtenFormat.format(new Date(review.reviewedAt))} ET from {review.tradeCount} closed{' '}
        {review.tradeCount === 1 ? 'trade' : 'trades'}, {covers}.
      </p>
    </div>
  );
}

// The Performance Review (CLAUDE.md, "Performance Review"): the figures for a date range
// at the top, then the coach's last analysis of it. Each analysis is a paid
// Claude call, so it is written only when asked for; the page loads the stored
// one with the figures.
export default function PerformanceReview() {
  const [range, setRange] = useState('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState(null);
  const [reason, setReason] = useState(null);

  const custom = range === 'custom';
  const datesOutOfOrder = custom && from && to && from > to;
  const ready = !custom || (from && to && !datesOutOfOrder);
  // from and to go only with a custom range (spreading false adds nothing).
  const selection = { range, ...(custom && { from, to }) };

  // Choosing another range or date starts over: an old error or reason was about the last one.
  const choose = (setter) => (value) => {
    setter(value);
    setError(null);
    setReason(null);
  };

  const { data, error: loadError, isLoading, mutate } = useSWR(
    ready ? `/api/insights/review?${new URLSearchParams(selection)}` : null,
    fetchJson,
    { revalidateOnFocus: false }
  );

  async function writeReview() {
    setWriting(true);
    setError(null);
    setReason(null);
    try {
      const res = await fetch('/api/insights/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selection),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(apiErrorMessage(json, "Couldn't write the review"));
        return;
      }
      if (!json.review) {
        setReason(json.reason);
        return;
      }
      await mutate({ ...data, review: json.review }, { revalidate: false });
    } catch {
      setError("Couldn't write the review");
    } finally {
      setWriting(false);
    }
  }

  let body = null;
  if (!ready) {
    body = <p className="text-sm text-gray-500">Choose both dates.</p>;
  } else if (isLoading) {
    body = <p className="text-sm text-gray-500">Loading…</p>;
  } else if (loadError) {
    body = (
      <div role="alert" className={alertClass}>
        {loadError.message}
      </div>
    );
  } else if (data.tradeCount === 0) {
    body = (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
        No closed trades in this range.
      </div>
    );
  } else {
    const { review } = data;
    body = (
      <div className="space-y-6">
        <StatsTable stats={data.stats} />
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-gray-700">Analysis</h2>
            {!isDemo() && (
              <button type="button" onClick={writeReview} disabled={writing} className={buttonClass}>
                {writing ? 'Writing…' : review ? 'Refresh analysis' : 'Write review'}
              </button>
            )}
          </div>
          {review ? (
            <ReviewText review={review} />
          ) : (
            <p className="text-sm text-gray-500">
              {isDemo() ? 'No review is stored for this range.' : 'No review written for this range yet.'}
            </p>
          )}
          {reason && <p className="text-sm text-gray-500">{reason}.</p>}
          {error && (
            <div role="alert" className={alertClass}>
              {error}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Range
          <select
            value={range}
            onChange={(e) => choose(setRange)(e.target.value)}
            disabled={writing}
            className={`${inputClass} disabled:opacity-50`}
          >
            {RANGES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {custom && (
          <>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              From
              <input type="date" value={from} onChange={(e) => choose(setFrom)(e.target.value)} disabled={writing} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              To
              <input type="date" value={to} onChange={(e) => choose(setTo)(e.target.value)} disabled={writing} className={inputClass} />
            </label>
          </>
        )}
        {datesOutOfOrder && (
          <p role="alert" className="text-sm text-red-800">
            The from date is after the to date.
          </p>
        )}
      </div>
      {body}
    </div>
  );
}
