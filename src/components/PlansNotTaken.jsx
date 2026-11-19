'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { formatProfitLoss } from '@/lib/format';

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const EXIT_LABELS = {
  invalidation: 'Invalidation',
  backstop: 'Backstop',
  t1: 'T1',
  time_stop: 'Time stop',
  session_close: 'Session close',
};

function Results({ data }) {
  if (data.plans === 0) return <p className="text-sm text-gray-500">No option plans were left unfilled in this range.</p>;
  const { summary } = data;
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-900">
        {`${plural(data.plans, 'plan')} ${data.plans === 1 ? 'was' : 'were'} never filled: ${data.neverTriggered} never triggered, ${data.replayed} replayed.`}
      </p>
      {data.replayed > 0 && (
        <>
          <p className="text-sm text-gray-700">
            {`Replayed at the planned size: ${formatProfitLoss(summary.netPnl)} net, ${percent.format(summary.winRate)} win rate (gross), ${formatProfitLoss(summary.netExpectancy)} a trade.`}
          </p>
          <div className="overflow-x-auto">
            <table aria-label="Replays by exit" className="text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Exit
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Replays
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(data.exits).map(([reason, count]) => (
                  <tr key={reason}>
                    <th scope="row" className="px-3 py-1.5 text-left font-medium text-gray-700">
                      {EXIT_LABELS[reason] ?? reason}
                    </th>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">
            {`${data.fullCoverage} of ${plural(data.replayed, 'replay')} held on a contract bar for every minute; the rest used the last bar traded. Fees are an estimate: ${formatProfitLoss(data.fees)} a trade, the median of ${plural(data.feesTrades, 'trade')} taken${data.feesTrades === 0 ? ' (none, so none assumed)' : ''}.`}
          </p>
        </>
      )}
    </div>
  );
}

// Option plans that were recorded and never filled, replayed on their bars (rules-v3 8.11):
// asked for when the button is pressed, never stored, in the page's Mode and Year.
export default function PlansNotTaken({ mode, year }) {
  const [requested, setRequested] = useState(false);
  const key = requested ? `/api/insights/plans-not-taken?${new URLSearchParams({ mode, year })}` : null;
  const { data, error, isLoading } = useSWR(key, fetchJson, { revalidateOnFocus: false });

  let body = null;
  if (requested && error) {
    body = (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  } else if (requested && (isLoading || !data)) {
    body = <p className="text-sm text-gray-500">Replaying each plan on its bars…</p>;
  } else if (requested) {
    body = <Results data={data} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {`Each unfilled option plan, from the time it was written on its day: in at the planned premium on the first contract bar that traded there (with none planned, at the open of the next bar), out at the first of the invalidation (a close beyond the plan's underlying stop), the backstop and the time stop (as set in the rule settings), T1 (the day's working fib 50%), or the close. Plans written today aren't included.`}
      </p>
      {!requested && (
        <button
          type="button"
          onClick={() => setRequested(true)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Replay plans not taken
        </button>
      )}
      {body}
    </div>
  );
}
