'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { apiErrorMessage } from '@/lib/fetchJson';

// Deletes a journal entry after a confirmation. A plan whose trade has a fill
// has no button: the entry holds the trade's controls (the server refuses it
// too). A plan never filled takes its trade with it, so the confirmation says
// what goes along.
export default function EntryDelete({ entry }) {
  const { mutate } = useSWRConfig();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (entry.kind === 'plan' && entry.trade?.openedAt) return null;

  const takesTrade = entry.kind === 'plan' && entry.trade;

  const remove = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/journal/${entry.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(apiErrorMessage(json, "Couldn't delete the entry"));
        return;
      }

      setConfirming(false);
      await mutate('/api/journal');
    } catch {
      setError("Couldn't delete the entry");
    } finally {
      setLoading(false);
    }
  };

  if (!confirming) {
    return (
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-sm text-gray-500 hover:text-red-700"
        >
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <p>
        Delete this entry?
        {takesTrade &&
          " This plan was never filled, so this also deletes its trade, with its checklist answers, screenshots, and context. Other entries on the trade stay but lose the link."}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={loading}
          className="rounded-md bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
