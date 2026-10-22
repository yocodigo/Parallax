'use client';

import { useState } from 'react';

const buttonClass =
  'rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';

// Each review is a paid call to Claude, so it's written only when asked for,
// not loaded with the page like the journal list.
export default function WeeklyReview() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const requestReview = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/weekly-review', { method: 'POST' });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error || "Couldn't write this week's review");
        return;
      }

      setResult(json);
    } catch {
      setError("Couldn't write this week's review");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-gray-700">Weekly review</h2>
        <button type="button" onClick={requestReview} disabled={loading} className={buttonClass}>
          {loading ? 'Writing…' : 'Review my week'}
        </button>
      </div>

      {result?.review && (
        <div>
          {/* The review is plain text with blank lines between paragraphs. */}
          <p className="whitespace-pre-line text-sm leading-6 text-gray-800">{result.review}</p>
          <p className="mt-2 text-xs text-gray-500">
            Based on {result.entryCount} {result.entryCount === 1 ? 'entry' : 'entries'} from the past 7 days.
          </p>
        </div>
      )}

      {result && !result.review && (
        <p className="text-sm text-gray-500">Nothing logged in the past 7 days.</p>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </section>
  );
}
