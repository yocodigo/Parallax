'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { fetchJson } from '@/lib/fetchJson';
import { EMOTION_LABELS, EMOTIONS, MISTAKE_LABELS, MISTAKES } from '@/lib/journalEntry';
import Field, { inputClass } from './Field';
import { capitalize, describeTrade } from './JournalEntries';

const EMPTY_FORM = { tradeId: '', notes: '', emotion: '', mistakes: [] };

const orUndefined = (value) => (value === '' ? undefined : value);

// The trades linked to journal entries, each once, in the journal's order
// (newest first). There's no trades API yet, so this is what can be reviewed.
function tradesIn(entries = []) {
  const byId = new Map();
  for (const { trade } of entries) {
    if (trade && !byId.has(trade.id)) byId.set(trade.id, trade);
  }
  return [...byId.values()];
}

export default function ReviewForm() {
  const { mutate } = useSWRConfig();
  const { data } = useSWR('/api/journal', fetchJson, { revalidateOnFocus: false });
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const trades = tradesIn(data?.entries);

  const set = (name) => (e) => setForm((current) => ({ ...current, [name]: e.target.value }));

  // Kept in the order of MISTAKES, whatever order the boxes were ticked in.
  const toggleMistake = (mistake) =>
    setForm((current) => {
      const ticked = current.mistakes.includes(mistake)
        ? current.mistakes.filter((m) => m !== mistake)
        : [...current.mistakes, mistake];
      return { ...current, mistakes: MISTAKES.filter((m) => ticked.includes(m)) };
    });

  // The first message the server sent for a field, if any.
  const errorFor = (name) => fieldErrors[name]?.[0];

  // Props shared by every input: wiring to state, plus its error message
  // linked for screen readers.
  const fieldProps = (name) => {
    const message = errorFor(name);
    return {
      id: `review-${name}`,
      value: form[name],
      onChange: set(name),
      'aria-invalid': message ? true : undefined,
      'aria-describedby': message ? `review-${name}-error` : undefined,
    };
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body = {
      kind: 'review',
      tradeId: orUndefined(form.tradeId),
      notes: form.notes,
      emotion: orUndefined(form.emotion),
      mistakes: form.mistakes,
    };

    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error || 'Could not save the review');
        setFieldErrors(json.fieldErrors || {});
        return;
      }

      setForm(EMPTY_FORM);
      setFieldErrors({});
      // Reload the journal list so the new review shows up in it.
      await mutate('/api/journal');
    } catch {
      setError('Could not save the review');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">Log a review</h2>

      <Field id="review-tradeId" label="Trade" error={errorFor('tradeId')}>
        <select {...fieldProps('tradeId')} className={inputClass}>
          <option value="">Not linked to a trade</option>
          {trades.map((trade) => (
            <option key={trade.id} value={trade.id}>
              {describeTrade(trade)} · {capitalize(trade.mode)}
            </option>
          ))}
        </select>
      </Field>

      <Field id="review-notes" label="Notes" error={errorFor('notes')}>
        <textarea
          {...fieldProps('notes')}
          required
          rows={3}
          placeholder="What happened, and did you follow the plan?"
          className={inputClass}
        />
      </Field>

      <fieldset>
        <legend className="text-xs font-medium text-gray-500">Mistakes</legend>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          {MISTAKES.map((mistake) => (
            <label key={mistake} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.mistakes.includes(mistake)}
                onChange={() => toggleMistake(mistake)}
              />
              {MISTAKE_LABELS[mistake]}
            </label>
          ))}
        </div>
        {errorFor('mistakes') && <p className="mt-1 text-xs text-red-700">{errorFor('mistakes')}</p>}
      </fieldset>

      <div className="flex flex-wrap items-end gap-3">
        <Field id="review-emotion" label="Emotion" error={errorFor('emotion')} className="w-48">
          <select {...fieldProps('emotion')} className={inputClass}>
            <option value="">Not noted</option>
            {EMOTIONS.map((emotion) => (
              <option key={emotion} value={emotion}>
                {EMOTION_LABELS[emotion]}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save review
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </form>
  );
}
