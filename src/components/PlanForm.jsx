'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { apiErrorMessage } from '@/lib/fetchJson';
import { EMOTION_LABELS, EMOTIONS } from '@/lib/journalEntry';
import Field, { inputClass } from './Field';
import HistoryWarnings from './HistoryWarnings';

const EMPTY_FORM = {
  mode: 'paper',
  symbol: '',
  assetClass: 'stock',
  direction: 'long',
  quantity: '',
  plannedEntry: '',
  initialStop: '',
  target: '',
  notes: '',
  emotion: '',
};

const NO_ERRORS = { plan: {}, entry: {} };

// Inputs hold strings. Blank becomes undefined, which JSON.stringify leaves
// out, so the server reports a missing field instead of a price of 0.
const toNumber = (value) => (value === '' ? undefined : Number(value));
const orUndefined = (value) => (value === '' ? undefined : value);

// A draft (from a voice note) holds parsed values; the inputs want strings.
function formFromDraft({ plan = {}, entry = {} }) {
  const values = { ...plan, notes: entry.notes, emotion: entry.emotion };
  const form = { ...EMPTY_FORM };
  for (const [name, value] of Object.entries(values)) {
    if (name in form && value != null) form[name] = String(value);
  }
  return form;
}

// `draft` and `draftErrors` prefill the form for confirming a voice note;
// `onSaved` receives the saved { trade, entry }.
export default function PlanForm({ draft, draftErrors = NO_ERRORS, onSaved }) {
  const { mutate } = useSWRConfig();
  const [form, setForm] = useState(() => (draft ? formFromDraft(draft) : EMPTY_FORM));
  const [fieldErrors, setFieldErrors] = useState({ ...NO_ERRORS, ...draftErrors });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (name) => (e) => setForm((current) => ({ ...current, [name]: e.target.value }));

  // The first message the server sent for a field, if any.
  const errorFor = (group, name) => fieldErrors[group][name]?.[0];

  // Props shared by every input: wiring to state, plus its error message
  // linked for screen readers.
  const fieldProps = (group, name) => {
    const message = errorFor(group, name);
    return {
      id: `plan-${name}`,
      value: form[name],
      onChange: set(name),
      'aria-invalid': message ? true : undefined,
      'aria-describedby': message ? `plan-${name}-error` : undefined,
    };
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body = {
      plan: {
        mode: form.mode,
        symbol: form.symbol,
        assetClass: form.assetClass,
        direction: form.direction,
        quantity: toNumber(form.quantity),
        plannedEntry: toNumber(form.plannedEntry),
        initialStop: toNumber(form.initialStop),
        target: toNumber(form.target),
      },
      entry: { notes: form.notes, emotion: orUndefined(form.emotion) },
    };

    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(apiErrorMessage(json, 'Could not save the plan'));
        setFieldErrors({ ...NO_ERRORS, ...json.fieldErrors });
        return;
      }

      setForm(EMPTY_FORM);
      setFieldErrors(NO_ERRORS);
      // Reload the journal list so the new plan shows up in it.
      await mutate('/api/journal');
      onSaved?.(json);
    } catch {
      setError('Could not save the plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">Log a plan</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field id="plan-mode" label="Mode">
          <select {...fieldProps('plan', 'mode')} className={inputClass}>
            <option value="paper">Paper</option>
            <option value="live">Live</option>
            <option value="backtest">Backtest</option>
          </select>
        </Field>

        <Field id="plan-symbol" label="Symbol" error={errorFor('plan', 'symbol')}>
          <input {...fieldProps('plan', 'symbol')} required placeholder="AAPL" className={inputClass} />
        </Field>

        <Field id="plan-assetClass" label="Asset class">
          <select {...fieldProps('plan', 'assetClass')} className={inputClass}>
            <option value="stock">Stock</option>
            <option value="option">Option</option>
            <option value="crypto">Crypto</option>
          </select>
        </Field>

        <Field id="plan-direction" label="Direction">
          <select {...fieldProps('plan', 'direction')} className={inputClass}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </Field>

        <Field id="plan-quantity" label="Quantity" error={errorFor('plan', 'quantity')}>
          <input {...fieldProps('plan', 'quantity')} type="number" step="any" required className={inputClass} />
        </Field>

        <Field id="plan-plannedEntry" label="Planned entry" error={errorFor('plan', 'plannedEntry')}>
          <input {...fieldProps('plan', 'plannedEntry')} type="number" step="any" required className={inputClass} />
        </Field>

        <Field id="plan-initialStop" label="Initial stop" error={errorFor('plan', 'initialStop')}>
          <input {...fieldProps('plan', 'initialStop')} type="number" step="any" required className={inputClass} />
        </Field>

        <Field id="plan-target" label="Target" error={errorFor('plan', 'target')}>
          <input {...fieldProps('plan', 'target')} type="number" step="any" placeholder="Optional" className={inputClass} />
        </Field>
      </div>

      <HistoryWarnings
        mode={form.mode}
        direction={form.direction}
        assetClass={form.assetClass}
        symbol={form.symbol}
      />

      <Field id="plan-notes" label="Notes" error={errorFor('entry', 'notes')}>
        <textarea
          {...fieldProps('entry', 'notes')}
          required
          rows={3}
          placeholder="Why this trade, and what would prove it wrong?"
          className={inputClass}
        />
      </Field>

      <div className="flex flex-wrap items-end gap-3">
        <Field id="plan-emotion" label="Emotion" error={errorFor('entry', 'emotion')} className="w-48">
          <select {...fieldProps('entry', 'emotion')} className={inputClass}>
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
          Save plan
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
