'use client';

import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { EXIT_REASON_LABELS } from '@/lib/tradeFill';

const nyTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
});

const price = (value) => value.toFixed(2);

const SKIPPED_TEXT = {
  no_daily_plan: 'No fib plan was recorded for that day, so there was no T1',
  fib_not_on_trade_side: 'The day’s 50% wasn’t ahead of the fill, so there was no T1',
  not_intraday: 'Held past the session, so step 5 doesn’t apply',
  no_bars: 'No bars to grade this from',
};

const REACTION_TEXT = {
  rejected: () => 'Rejected at T1',
  ripped: () => 'Ripped through T1',
  oscillating: ({ drifting }) => `Oscillated at T1${drifting ? ', drifting the trade’s way' : ''}`,
  none: () => 'Nothing was decided at T1',
};

// Setups.md 3.1 step 5 against the exit, by timing (exitReview.js's judge).
const VERDICT_TEXT = {
  matched: 'Exit matched step 5',
  early: 'Exit was early against step 5',
  before_t1: 'Exited before T1 was touched',
  not_reached: 'Price never reached T1',
  not_judged: 'Not judged: one exit per trade can’t show a partial',
  no_rule: 'Step 5 gave no instruction',
  not_decided: 'The reaction hadn’t been decided when the bars ended',
};

const VERDICT_STYLES = {
  matched: 'bg-green-50 text-green-700',
  early: 'bg-amber-100 text-amber-900',
};

function reactionText(reaction) {
  const text = REACTION_TEXT[reaction.kind]?.(reaction) ?? 'Not decided at T1';
  return `${text}, touched ${nyTime.format(new Date(reaction.touchAt))}`;
}

// A closed trade's exit review (setups.md section 10, after the exit): the
// reaction at T1 and whether the exit matched 3.1 step 5. `exitReason` is the
// trader's own tag, shown beside the verdict, which is judged from the bars.
export default function TradeExitReview({ tradeId, exitReason }) {
  const { data, error, isLoading } = useSWR(`/api/trades/${tradeId}/exit-review`, fetchJson, {
    revalidateOnFocus: false,
  });

  if (isLoading) return <p className="text-xs text-gray-500">Loading review…</p>;
  if (error) return <p className="text-xs text-red-700">{error.message}</p>;

  const { review, reason } = data;
  if (!review) return <p className="text-xs text-gray-500">{reason ?? 'No exit review for this trade.'}</p>;
  if (review.skipped) return <p className="text-xs text-gray-500">{SKIPPED_TEXT[review.skipped]}</p>;

  return (
    <div className="space-y-1.5 text-xs text-gray-700">
      <ul className="space-y-0.5 tabular-nums">
        <li>{`T1 ${price(review.t1)}, T2 ${price(review.t2)}`}</li>
        {review.reaction && <li>{reactionText(review.reaction)}</li>}
        <li>
          {`Underlying at exit ${price(review.exitUnderlying)}, recorded reason: ${EXIT_REASON_LABELS[exitReason] ?? 'none'}`}
        </li>
      </ul>
      <span className={`inline-block rounded px-1.5 py-0.5 ${VERDICT_STYLES[review.verdict] ?? 'bg-gray-100 text-gray-500'}`}>
        {VERDICT_TEXT[review.verdict]}
      </span>
    </div>
  );
}
