'use client';

import useSWR from 'swr';
import { fetchJson } from '@/lib/fetchJson';

const SETUP_LABELS = { band_cross: '15m band cross' };

const price = (value) => value.toFixed(2);

// The fill against the setup's ideal entry, in R of the ideal stop distance.
function chaseText(chaseR) {
  const rounded = Math.abs(chaseR).toFixed(1);
  if (rounded === '0.0') return 'Filled at the ideal entry';
  return chaseR > 0 ? `Chased ${rounded}R past the ideal entry` : `Filled ${rounded}R better than the ideal entry`;
}

function Flag({ children, style }) {
  return <span className={`rounded px-1.5 py-0.5 ${style}`}>{children}</span>;
}

// A recorded trade's entry review (setups.md section 10): what the bars that
// closed before the fill showed, and where the fill sat against the setup's
// ideal entry.
export default function TradeReview({ tradeId }) {
  const { data, error, isLoading } = useSWR(`/api/trades/${tradeId}/review`, fetchJson, {
    revalidateOnFocus: false,
  });

  if (isLoading) return <p className="text-xs text-gray-500">Loading review…</p>;
  if (error) return <p className="text-xs text-red-700">{error.message}</p>;

  const { review, reason } = data;
  if (!review) return <p className="text-xs text-gray-500">{reason ?? 'No entry review for this trade.'}</p>;

  const { setup, chaseR, entryCandle, room, fourTouch } = review;
  const noFlags = !review.inLockout && !review.midRange && !review.pressureDate && !review.seasonalDate;

  return (
    <div className="space-y-1.5 text-xs text-gray-700">
      <ul className="space-y-0.5 tabular-nums">
        <li>
          {setup
            ? `${SETUP_LABELS[setup.name]}: ideal entry ${price(setup.idealEntry)}, stop ${price(setup.idealStop)}`
            : 'No 15m band cross entry had formed'}
        </li>
        {chaseR !== null && <li>{chaseText(chaseR)}</li>}
        {entryCandle && (
          <li>
            {`Overlap ${Math.round(entryCandle.overlap * 100)}% of the previous 5m bar, volume ${
              entryCandle.volumeVsPrevious === null ? '?' : `${entryCandle.volumeVsPrevious.toFixed(1)}×`
            } it`}
          </li>
        )}
        {room && <li>{`Room to the 1m outer band: ${price(room.distance)} (needs ${price(room.needed)})`}</li>}
        {fourTouch && (
          <li>{`${fourTouch.kind} on the ${fourTouch.timeframe}, ${fourTouch.status}, grade ${fourTouch.grade.grade}`}</li>
        )}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {review.inLockout && <Flag style="bg-red-50 text-red-700">In a lockout window</Flag>}
        {review.midRange && <Flag style="bg-red-50 text-red-700">Mid-range entry</Flag>}
        {review.pressureDate && <Flag style="bg-amber-100 text-amber-900">Pressure date</Flag>}
        {review.seasonalDate && <Flag style="bg-amber-100 text-amber-900">{`Gann date ${review.seasonalDate}`}</Flag>}
        {noFlags && <span className="text-gray-500">No lockout, mid-range, or calendar flags</span>}
      </div>
    </div>
  );
}
