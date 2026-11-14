'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { apiErrorMessage, fetchJson } from '@/lib/fetchJson';
import Field, { inputClass } from './Field';

const KEY = '/api/rule-settings';

// Inputs hold strings; a blank value is not set, which the server stores as null.
const toNumber = (value) => (value === '' ? null : Number(value));
const toText = (value) => (value === null ? '' : String(value));
// The backstop is a share of the premium, edited as a percent. Rounded so
// 0.3 × 100 doesn't come out as 30.000000000000004.
const toPercent = (share) => String(Math.round(share * 10000) / 100);

function Rule({ id, label, on, onToggle, hint, children }) {
  return (
    <fieldset className="space-y-2 border-t border-gray-100 pt-3">
      <label htmlFor={`rules-${id}-on`} className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
        <input id={`rules-${id}-on`} type="checkbox" checked={on} onChange={onToggle} />
        {label}
      </label>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      {children}
    </fieldset>
  );
}

function SettingsForm({ settings, onSaved }) {
  const [form, setForm] = useState(() => ({
    ...settings,
    sizeMin: String(settings.sizeMin),
    sizeMax: String(settings.sizeMax),
    premiumMin: String(settings.premiumMin),
    premiumMax: toText(settings.premiumMax),
    riskPerTrade: toText(settings.riskPerTrade),
    backstopPct: toPercent(settings.backstopPct),
    timeStopMinutes: String(settings.timeStopMinutes),
    windows: settings.windows.map(([from, to]) => [from, to]),
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const errorFor = (name) => fieldErrors[name]?.[0];
  const set = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const toggle = (name) => setForm((current) => ({ ...current, [name]: !current[name] }));
  const setWindow = (index, side, value) =>
    setForm((current) => ({
      ...current,
      windows: current.windows.map((w, i) => (i === index ? w.map((t, s) => (s === side ? value : t)) : w)),
    }));

  const number = (name, label, step = 'any') => {
    const message = errorFor(name);
    return (
      <Field key={name} id={`rules-${name}`} label={label} error={message}>
        <input
          id={`rules-${name}`}
          type="number"
          min="0"
          step={step}
          value={form[name]}
          onChange={(e) => set(name, e.target.value)}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `rules-${name}-error` : undefined}
          className={inputClass}
        />
      </Field>
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const body = {
      ...form,
      sizeMin: Number(form.sizeMin),
      sizeMax: Number(form.sizeMax),
      premiumMin: Number(form.premiumMin),
      premiumMax: toNumber(form.premiumMax),
      riskPerTrade: toNumber(form.riskPerTrade),
      // Back to a share, rounded so 30% is 0.3 and not 0.30000000000000004.
      backstopPct: Math.round(Number(form.backstopPct) * 100) / 10000,
      timeStopMinutes: Number(form.timeStopMinutes),
    };

    try {
      const res = await fetch(KEY, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(apiErrorMessage(json, 'Could not save the rules'));
        setFieldErrors(json.fieldErrors || {});
        return;
      }

      setFieldErrors({});
      setSaved(true);
      onSaved(json);
    } catch {
      setError('Could not save the rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-gray-500">
        Turning a rule off keeps its values. Times are New York time, the clock the app keeps.
      </p>

      <Rule
        id="windows"
        label="Entry windows"
        on={form.windowsOn}
        onToggle={() => toggle('windowsOn')}
        hint="Recorded and charted. They are not scored until setups are detected."
      >
        {form.windows.map(([from, to], index) => (
          <div key={index} className="flex items-end gap-2">
            <Field id={`rules-window-${index}-from`} label={`Window ${index + 1} starts`}>
              <input
                id={`rules-window-${index}-from`}
                type="time"
                value={from}
                onChange={(e) => setWindow(index, 0, e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id={`rules-window-${index}-to`} label={`Window ${index + 1} ends`}>
              <input
                id={`rules-window-${index}-to`}
                type="time"
                value={to}
                onChange={(e) => setWindow(index, 1, e.target.value)}
                className={inputClass}
              />
            </Field>
            <button
              type="button"
              onClick={() => set('windows', form.windows.filter((_, i) => i !== index))}
              aria-label={`Remove window ${index + 1}`}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Remove
            </button>
          </div>
        ))}
        {errorFor('windows') && <p className="text-xs text-red-700">{errorFor('windows')}</p>}
        <button
          type="button"
          onClick={() => set('windows', [...form.windows, ['', '']])}
          className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
        >
          Add window
        </button>
      </Rule>

      <Rule id="size" label="Contract range" on={form.sizeOn} onToggle={() => toggle('sizeOn')}>
        <div className="grid grid-cols-2 gap-3">
          {number('sizeMin', 'Fewest contracts', '1')}
          {number('sizeMax', 'Most contracts', '1')}
        </div>
      </Rule>

      <Rule id="premiumBand" label="Premium band" on={form.premiumBandOn} onToggle={() => toggle('premiumBandOn')}>
        <div className="grid grid-cols-2 gap-3">
          {number('premiumMin', 'Lowest premium ($)')}
          {number('premiumMax', 'Highest premium ($)')}
        </div>
        <p className="text-xs text-gray-500">Leave the highest blank for no ceiling.</p>
      </Rule>

      <Rule
        id="risk"
        label="Risk per trade"
        on={form.riskPerTrade !== ''}
        onToggle={() => set('riskPerTrade', form.riskPerTrade === '' ? '20' : '')}
        hint="Not set until the winners’ heat gives it a number."
      >
        {number('riskPerTrade', 'Risk per trade ($)')}
      </Rule>

      <Rule id="backstop" label="Backstop" on={form.backstopOn} onToggle={() => toggle('backstopOn')}>
        {number('backstopPct', 'Backstop (% below the entry premium)')}
      </Rule>

      <Rule id="timeStop" label="Time stop" on={form.timeStopOn} onToggle={() => toggle('timeStopOn')}>
        {number('timeStopMinutes', 'Time stop (minutes)', '1')}
      </Rule>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save rules
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

// The option rules the trader edits: windows, contract range, premium band,
// risk per trade, backstop, and time stop, each with an on flag.
export default function RuleSettings() {
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
    // The saved response already holds the new settings.
    body = <SettingsForm settings={data.settings} onSaved={(json) => mutate(json, { revalidate: false })} />;
  }

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">Option rules</h2>
      {body}
    </section>
  );
}
