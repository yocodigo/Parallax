'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { apiErrorMessage } from '@/lib/fetchJson';
import { isDemo } from '@/lib/demo';

const buttonClass =
  'rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';

// The coaching pass on a review entry (setups.md section 11). Each pass is a
// paid call to Claude, so it runs only when asked for; the text is stored on
// the review, and pressing the button again replaces it.
export default function EntryCoaching({ entry }) {
  const { mutate } = useSWRConfig();
  // What the last request returned, shown until the journal list reloads.
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const coaching = result?.coaching ?? entry.coaching;
  const coachedAt = result?.coachedAt ?? entry.coachedAt;

  const requestCoaching = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/journal/${entry.id}/coaching`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(apiErrorMessage(json, "Couldn't write the coaching"));
        return;
      }

      setResult(json);
      await mutate('/api/journal');
    } catch {
      setError("Couldn't write the coaching");
    } finally {
      setLoading(false);
    }
  };

  // The demo shows seeded coaching but never pays for a new one.
  if (isDemo() && !coaching) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-gray-700">Coaching</h3>
        {!isDemo() && (
          <button type="button" onClick={requestCoaching} disabled={loading} className={buttonClass}>
            {loading ? 'Writing…' : coaching ? 'Coach again' : 'Coach this day'}
          </button>
        )}
      </div>

      {coaching && (
        <div>
          {/* Plain text with blank lines between paragraphs, like the weekly review. */}
          <p className="whitespace-pre-line text-sm leading-6 text-gray-800">{coaching}</p>
          {coachedAt && (
            <p className="mt-2 text-xs text-gray-500">Written {new Date(coachedAt).toLocaleString()}.</p>
          )}
        </div>
      )}

      {result && !result.coaching && <p className="text-sm text-gray-500">{result.reason}.</p>}

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
