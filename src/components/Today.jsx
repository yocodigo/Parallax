'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { isDemo } from '@/lib/demo';
import { fetchJson } from '@/lib/fetchJson';
import { formatProfitLoss, formatTradeTime } from '@/lib/format';
import DailyPlanForm from './DailyPlanForm';
import EntryCoaching from './EntryCoaching';
import { inputClass } from './Field';
import { describeTrade } from './JournalEntries';
import ReviewForm from './ReviewForm';
import ThinkorswimImport from './ThinkorswimImport';
import useDisplayZone from './useDisplayZone';
import VoiceNote from './VoiceNote';

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const todayNy = () => nyDate.format(new Date());

// A 'YYYY-MM-DD' calendar date moved by whole days, worked out at noon UTC so
// no time zone can shift it.
const addDays = (day, days) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const MODES = [
  ['live', 'Live'],
  ['paper', 'Paper'],
  ['backtest', 'Backtest'],
];

const PLAN_STATUS = { done: 'Done', started: 'Fib not set', todo: 'To do' };
const IMPORT_STATUS = { done: 'Done', open: 'Trades still open', todo: 'No trades yet' };
const countStatus = ({ status, done, of }) =>
  status === 'waiting' ? 'Nothing yet' : status === 'done' ? 'Done' : `${done} of ${of}`;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const buttonClass = 'rounded-md border border-gray-300 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40';

// One step of the loop: a numbered heading with its status. A step that is
// done shows `summary` and keeps its body behind a button (`toggleLabel`).
function Step({ number, title, status, done, summary, toggleLabel = 'Show', children }) {
  const [open, setOpen] = useState(false);
  const id = `today-step-${number}`;
  const showBody = !done || open;

  return (
    <section aria-labelledby={id} className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-base font-semibold text-gray-900">
          <span className="mr-2 text-gray-400 tabular-nums">{number}</span>
          {title}
        </h2>
        <span
          className={`rounded px-2 py-0.5 text-xs ${done ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
        >
          {status}
        </span>
      </header>
      {done && summary && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
          <div className="text-sm text-gray-700">{summary}</div>
          {children && (
            <button type="button" onClick={() => setOpen(!open)} className={buttonClass}>
              {open ? 'Hide' : toggleLabel}
            </button>
          )}
        </div>
      )}
      {showBody && children && <div className="mt-4">{children}</div>}
    </section>
  );
}

// "SPY: fib 50% 590, 100% 595 (bullish)", or the overnight levels count when
// the fib isn't anchored yet.
function describePlan(plan) {
  if (plan.ltfFib50 != null) {
    return `${plan.symbol}: fib 50% ${plan.ltfFib50}, 100% ${plan.ltfFib100} (${plan.ltfDirection})`;
  }
  return `${plan.symbol}: overnight levels, no fib yet`;
}

const pnlTone = (pnl) => (pnl >= 0 ? 'text-green-700' : 'text-red-700');

function reviewStatus({ trade, reviews }) {
  if (!trade.closedAt) return 'Still open';
  return reviews.length > 0 ? 'Reviewed' : 'Not reviewed';
}

// The daily loop for one New York day: plan, import, review each trade, and
// read the coaching. The day and mode are picked here; everything else comes
// from GET /api/today.
export default function Today() {
  const zone = useDisplayZone();
  const today = todayNy();
  const [day, setDay] = useState(today);
  const [mode, setMode] = useState('live');
  const { data, error, isLoading, mutate } = useSWR(`/api/today?day=${day}&mode=${mode}`, fetchJson, {
    revalidateOnFocus: false,
  });
  const refresh = () => mutate();
  // The trade whose review is open, voice note first; one at a time.
  const [reviewing, setReviewing] = useState(null);
  const reviewSaved = () => {
    setReviewing(null);
    refresh();
  };

  let body;
  if (isLoading) {
    body = <p className="text-sm text-gray-500">Loading the day…</p>;
  } else if (error) {
    body = (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  } else {
    const { plans, summary } = data;
    const { steps, rows } = summary;
    const reviews = rows.flatMap((row) => row.reviews.map((review) => ({ review, trade: row.trade })));

    body = (
      <>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700 tabular-nums">
          <span>{plural(summary.tradeCount, 'trade')}</span>
          {summary.closedCount > 0 && (
            <span className={pnlTone(summary.netPnl)}>{`${formatProfitLoss(summary.netPnl)} net`}</span>
          )}
          {summary.closedCount > 0 && <span>{`${summary.reviewed} of ${summary.closedCount} reviewed`}</span>}
        </p>

        {/* Keyed by day, so a step opened on one day starts closed on the next. */}
        <div key={day} className="space-y-4">
          <Step
            number={1}
            title="Plan"
            status={PLAN_STATUS[steps.plan]}
            done={steps.plan === 'done'}
            toggleLabel={isDemo() ? 'Show' : 'Edit plan'}
            summary={
              <ul className="space-y-1">
                {plans.map((plan) => (
                  <li key={plan.symbol}>{describePlan(plan)}</li>
                ))}
              </ul>
            }
          >
            {isDemo() ? (
              <p className="text-sm text-gray-500">
                {plans.length === 0 ? 'No plan for this day.' : plans.map(describePlan).join('; ')}
              </p>
            ) : (
              <DailyPlanForm tradeDate={day} onSaved={refresh} />
            )}
          </Step>

          <Step
            number={2}
            title="Import"
            status={IMPORT_STATUS[steps.import]}
            done={steps.import === 'done'}
            summary={`${plural(summary.tradeCount, 'trade')}, every one closed.`}
          >
            {isDemo() ? (
              <p className="text-sm text-gray-500">Importing statements is turned off in the demo.</p>
            ) : (
              <ThinkorswimImport onImported={refresh} />
            )}
          </Step>

          <Step number={3} title="Review" status={countStatus(steps.review)} done={false}>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500">No trades on this day.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <li
                    key={row.trade.id}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-sm tabular-nums"
                  >
                    <span className="w-16 text-gray-500">{formatTradeTime(row.trade.openedAt, zone)}</span>
                    <span className="text-gray-900">{describeTrade(row.trade)}</span>
                    {row.pnl != null && <span className={pnlTone(row.pnl)}>{formatProfitLoss(row.pnl)}</span>}
                    <span className="ml-auto text-gray-500">{reviewStatus(row)}</span>
                    {!isDemo() && row.trade.closedAt && reviewing !== row.trade.id && (
                      <button type="button" onClick={() => setReviewing(row.trade.id)} className={buttonClass}>
                        {row.reviews.length > 0 ? 'Review again' : 'Review'}
                      </button>
                    )}
                    {reviewing === row.trade.id && (
                      <div
                        role="group"
                        aria-label={`Review of ${describeTrade(row.trade)}`}
                        className="mt-2 w-full basis-full space-y-3"
                      >
                        <VoiceNote trade={row.trade} onSaved={reviewSaved} />
                        <ReviewForm trade={row.trade} onSaved={reviewSaved} />
                        <button type="button" onClick={() => setReviewing(null)} className={buttonClass}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Step>

          <Step number={4} title="Coach" status={countStatus(steps.coach)} done={false}>
            {reviews.length === 0 ? (
              <p className="text-sm text-gray-500">Coaching follows each review.</p>
            ) : (
              <div className="space-y-4">
                {reviews.map(({ review, trade }) => (
                  <div key={review.id}>
                    <p className="text-sm font-medium text-gray-800">{describeTrade(trade)}</p>
                    <EntryCoaching entry={review} onCoached={refresh} />
                  </div>
                ))}
              </div>
            )}
          </Step>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Day and mode" className="flex flex-wrap items-end gap-3">
        <button type="button" onClick={() => setDay(addDays(day, -1))} className={buttonClass}>
          Previous day
        </button>
        <label className="text-sm text-gray-700">
          <span className="block text-xs text-gray-500">Day</span>
          <input
            type="date"
            aria-label="Day"
            value={day}
            max={today}
            onChange={(event) => event.target.value && setDay(event.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="button"
          onClick={() => setDay(addDays(day, 1))}
          disabled={day >= today}
          className={buttonClass}
        >
          Next day
        </button>
        {day !== today && (
          <button type="button" onClick={() => setDay(today)} className={buttonClass}>
            Today
          </button>
        )}
        <label className="ml-auto text-sm text-gray-700">
          <span className="block text-xs text-gray-500">Mode</span>
          <select aria-label="Mode" value={mode} onChange={(event) => setMode(event.target.value)} className={inputClass}>
            {MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {body}
    </div>
  );
}
