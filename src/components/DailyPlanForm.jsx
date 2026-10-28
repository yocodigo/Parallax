'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { apiErrorMessage, fetchJson } from '@/lib/fetchJson';
import Field, { inputClass } from './Field';

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const today = () => nyDate.format(new Date());

const keyFor = (tradeDate) => `/api/daily-plan?tradeDate=${tradeDate}`;

// Inputs hold strings. Blank becomes undefined, which JSON.stringify leaves
// out, so a dropped second fib clears rather than saving a price of 0.
const toNumber = (value) => (value === '' ? undefined : Number(value));
const orUndefined = (value) => (value === '' ? undefined : value);

function formFromPlan(tradeDate, plan) {
  return {
    tradeDate,
    ltfDirection: plan?.ltfDirection ?? 'bullish',
    ltfFib50: plan?.ltfFib50 != null ? String(plan.ltfFib50) : '',
    ltfFib100: plan?.ltfFib100 != null ? String(plan.ltfFib100) : '',
    htfDirection: plan?.htfDirection ?? '',
    htfFib50: plan?.htfFib50 != null ? String(plan.htfFib50) : '',
    htfFib100: plan?.htfFib100 != null ? String(plan.htfFib100) : '',
    notes: plan?.notes ?? '',
  };
}

// Re-mounted (via `key`) whenever the shown day changes, so its state starts
// fresh from that day's plan instead of carrying over the last one's inputs.
function FibFields({ tradeDate, plan, onDateChange, onSaved }) {
  const [form, setForm] = useState(() => formFromPlan(tradeDate, plan));
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (name) => (e) => setForm((current) => ({ ...current, [name]: e.target.value }));

  const errorFor = (name) => fieldErrors[name]?.[0];

  const fieldProps = (name) => {
    const message = errorFor(name);
    return {
      id: `daily-plan-${name}`,
      value: form[name],
      onChange: set(name),
      'aria-invalid': message ? true : undefined,
      'aria-describedby': message ? `daily-plan-${name}-error` : undefined,
    };
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const body = {
      tradeDate: form.tradeDate,
      ltfDirection: form.ltfDirection,
      ltfFib50: toNumber(form.ltfFib50),
      ltfFib100: toNumber(form.ltfFib100),
      htfDirection: orUndefined(form.htfDirection),
      htfFib50: toNumber(form.htfFib50),
      htfFib100: toNumber(form.htfFib100),
      notes: orUndefined(form.notes),
    };

    try {
      const res = await fetch('/api/daily-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(apiErrorMessage(json, 'Could not save the daily plan'));
        setFieldErrors(json.fieldErrors || {});
        return;
      }

      setFieldErrors({});
      setSaved(true);
      onSaved(json.plan);
    } catch {
      setError('Could not save the daily plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field id="daily-plan-tradeDate" label="Day" error={errorFor('tradeDate')}>
        <input
          id="daily-plan-tradeDate"
          type="date"
          value={form.tradeDate}
          onChange={(e) => onDateChange(e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field id="daily-plan-ltfDirection" label="LTF direction">
          <select {...fieldProps('ltfDirection')} className={inputClass}>
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
          </select>
        </Field>
        <Field id="daily-plan-ltfFib50" label="LTF 50%" error={errorFor('ltfFib50')}>
          <input {...fieldProps('ltfFib50')} type="number" step="any" required className={inputClass} />
        </Field>
        <Field id="daily-plan-ltfFib100" label="LTF 100%" error={errorFor('ltfFib100')}>
          <input {...fieldProps('ltfFib100')} type="number" step="any" required className={inputClass} />
        </Field>
      </div>

      <p className="text-xs text-gray-500">Second fib (optional)</p>
      <div className="grid grid-cols-3 gap-3">
        <Field id="daily-plan-htfDirection" label="HTF direction">
          <select {...fieldProps('htfDirection')} className={inputClass}>
            <option value="">Not set</option>
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
          </select>
        </Field>
        <Field id="daily-plan-htfFib50" label="HTF 50%" error={errorFor('htfFib50')}>
          <input {...fieldProps('htfFib50')} type="number" step="any" className={inputClass} />
        </Field>
        <Field id="daily-plan-htfFib100" label="HTF 100%" error={errorFor('htfFib100')}>
          <input {...fieldProps('htfFib100')} type="number" step="any" className={inputClass} />
        </Field>
      </div>

      <Field id="daily-plan-notes" label="Notes" error={errorFor('notes')}>
        <textarea {...fieldProps('notes')} rows={2} placeholder="Optional" className={inputClass} />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save plan
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

// The day's fib extensions, anchored by hand around the open. Defaults to
// today (New York), and switching the date loads that day's plan instead.
export default function DailyPlanForm() {
  const { mutate } = useSWRConfig();
  const [tradeDate, setTradeDate] = useState(today);
  const { data, error, isLoading } = useSWR(keyFor(tradeDate), fetchJson, {
    revalidateOnFocus: false,
  });

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
      <FibFields
        key={tradeDate}
        tradeDate={tradeDate}
        plan={data.plan}
        onDateChange={setTradeDate}
        onSaved={(plan) => mutate(keyFor(tradeDate), { plan }, { revalidate: false })}
      />
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">Daily plan</h2>
      {body}
    </section>
  );
}
