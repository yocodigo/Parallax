'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { describeBreaker } from '@/lib/circuitBreakers';
import { apiErrorMessage, fetchJson } from '@/lib/fetchJson';
import { formatR } from '@/lib/format';
import Field, { inputClass } from './Field';

const KEY = '/api/circuit-breakers';
const MODES = [
  ['live', 'Live'],
  ['paper', 'Paper'],
  ['backtest', 'Backtest'],
];
const LIMITS = [
  ['maxDailyLossR', 'Daily max loss (R)', 'any'],
  ['maxTradesPerDay', 'Max trades per day', '1'],
  ['cooldownAfterLosses', 'Cool-down after losses in a row', '1'],
  ['cooldownMinutes', 'Cool-down minutes', '1'],
];

// Inputs hold strings; a blank limit is off, which the server stores as null.
const toLimit = (value) => (value === '' ? null : Number(value));

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Status({ status }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-gray-600">
        {`Today: ${formatR(status.today.r)} over ${plural(status.today.trades, 'trade')}. Losing streak: ${status.losingStreak}.`}
      </p>
      {status.tripped.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-md border border-amber-300 bg-amber-50 py-2 pl-8 pr-3 text-amber-900">
          {status.tripped.map((tripped) => (
            <li key={tripped.breaker}>{describeBreaker(tripped)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsForm({ settings, onSaved }) {
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(LIMITS.map(([name]) => [name, settings[name] === null ? '' : String(settings[name])])),
    modes: settings.modes,
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const errorFor = (name) => fieldErrors[name]?.[0];

  const toggleMode = (mode) =>
    setForm((current) => {
      const modes = current.modes.includes(mode)
        ? current.modes.filter((m) => m !== mode)
        : [...current.modes, mode];
      // Kept in the listed order, whatever order the boxes were ticked in.
      return { ...current, modes: MODES.map(([m]) => m).filter((m) => modes.includes(m)) };
    });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const body = {
      ...Object.fromEntries(LIMITS.map(([name]) => [name, toLimit(form[name])])),
      modes: form.modes,
    };

    try {
      const res = await fetch(KEY, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(apiErrorMessage(json, 'Could not save the limits'));
        setFieldErrors(json.fieldErrors || {});
        return;
      }

      setFieldErrors({});
      setSaved(true);
      onSaved(json);
    } catch {
      setError('Could not save the limits');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-gray-500">
        Leave a limit blank to turn it off. While one is reached, recording a new entry asks you to
        override it, and the trade remembers that you did.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {LIMITS.map(([name, label, step]) => {
          const message = errorFor(name);
          return (
            <Field key={name} id={`breakers-${name}`} label={label} error={message}>
              <input
                id={`breakers-${name}`}
                type="number"
                min="0"
                step={step}
                value={form[name]}
                onChange={(e) => setForm((current) => ({ ...current, [name]: e.target.value }))}
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? `breakers-${name}-error` : undefined}
                placeholder="Off"
                className={inputClass}
              />
            </Field>
          );
        })}
      </div>
      <fieldset>
        <legend className="text-xs font-medium text-gray-500">Apply to</legend>
        <div className="mt-1 flex gap-4 text-sm text-gray-700">
          {MODES.map(([mode, label]) => (
            <label key={mode} className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.modes.includes(mode)} onChange={() => toggleMode(mode)} />
              {label}
            </label>
          ))}
        </div>
        {errorFor('modes') && <p className="mt-1 text-xs text-red-700">{errorFor('modes')}</p>}
      </fieldset>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save limits
        </button>
        {saved && <span className="text-sm text-gray-500">Saved.</span>}
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </form>
  );
}

// The trader's circuit breakers: where today stands against them, and the
// limits themselves.
export default function CircuitBreakers() {
  const { data, error, isLoading, mutate } = useSWR(KEY, fetchJson, { revalidateOnFocus: false });

  let body;
  if (isLoading) {
    body = <p className="text-sm text-gray-500">Loading…</p>;
  } else if (error) {
    body = (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  } else {
    body = (
      <>
        <Status status={data.status} />
        {/* The saved response already holds the new settings and status. */}
        <SettingsForm settings={data.settings} onSaved={(json) => mutate(json, { revalidate: false })} />
      </>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">Circuit breakers</h2>
      {body}
    </section>
  );
}
