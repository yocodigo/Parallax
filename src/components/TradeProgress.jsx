'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { apiErrorMessage } from '@/lib/fetchJson';
import { profitLoss, rMultiple, tradeStatus } from '@/lib/tradeMetrics';
import Field, { inputClass } from './Field';

const buttonClass =
  'rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50';
const secondaryButtonClass =
  'rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50';

const EXIT_REASONS = [
  ['target', 'Target hit'],
  ['stop', 'Stop hit'],
  ['time', 'Time'],
  ['discretionary', 'Discretionary'],
];

const STATUS_STYLES = {
  planned: 'bg-gray-100 text-gray-700',
  open: 'bg-blue-50 text-blue-700',
  closed: 'bg-gray-800 text-white',
};

// Inputs hold strings. Blank becomes undefined, which JSON.stringify leaves
// out, so the server reports a missing field instead of a price of 0.
const toNumber = (value) => (value === '' ? undefined : Number(value));

// A datetime-local input wants local "YYYY-MM-DDTHH:mm"; the server wants ISO.
function toLocalInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
const toIso = (value) => (value ? new Date(value).toISOString() : undefined);

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  signDisplay: 'always',
});
const formatR = (r) => `${r > 0 ? '+' : ''}${r.toFixed(1)}R`;

// A small form posting one step (entry or exit) of a trade. Fields render
// through `children({ fieldProps, errorFor, form, setForm })`; `toBody(form)`
// builds the request.
function StepForm({ trade, step, initial, toBody, submitLabel, onDone, children }) {
  const { mutate } = useSWRConfig();
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const errorFor = (name) => fieldErrors[name]?.[0];
  const fieldProps = (name) => {
    const id = `${trade.id}-${name}`;
    const message = errorFor(name);
    return {
      id,
      value: form[name],
      onChange: (e) => setForm((current) => ({ ...current, [name]: e.target.value })),
      'aria-invalid': message ? true : undefined,
      'aria-describedby': message ? `${id}-error` : undefined,
    };
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/trades/${trade.id}/${step}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toBody(form)),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(apiErrorMessage(json, `Could not save the ${step}`));
        setFieldErrors(json.fieldErrors || {});
        return;
      }

      // Reload the journal so every entry linked to this trade shows the change.
      await mutate('/api/journal');
      onDone();
    } catch {
      setError(`Could not save the ${step}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-md border border-gray-200 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children({ fieldProps, errorFor, form, setForm })}</div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={buttonClass}>
          {submitLabel}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}
    </form>
  );
}

function EntryForm({ trade, onDone }) {
  return (
    <StepForm
      trade={trade}
      step="entry"
      submitLabel="Save entry"
      initial={{ entryPrice: '', openedAt: toLocalInput(new Date()) }}
      toBody={(form) => ({ entryPrice: toNumber(form.entryPrice), openedAt: toIso(form.openedAt) })}
      onDone={onDone}
    >
      {({ fieldProps, errorFor }) => (
        <>
          <Field id={`${trade.id}-entryPrice`} label="Fill price" error={errorFor('entryPrice')}>
            <input {...fieldProps('entryPrice')} type="number" step="any" required className={inputClass} />
          </Field>
          <Field id={`${trade.id}-openedAt`} label="Fill time" error={errorFor('openedAt')}>
            <input {...fieldProps('openedAt')} type="datetime-local" className={inputClass} />
          </Field>
        </>
      )}
    </StepForm>
  );
}

function ExitForm({ trade, onDone }) {
  return (
    <StepForm
      trade={trade}
      step="exit"
      submitLabel="Save exit"
      initial={{ exitPrice: '', closedAt: toLocalInput(new Date()), exitReason: '', exitedPerPlan: '', fees: '' }}
      toBody={(form) => ({
        exitPrice: toNumber(form.exitPrice),
        closedAt: toIso(form.closedAt),
        exitReason: form.exitReason || undefined,
        // Unanswered stays undefined, so the server asks rather than assuming.
        exitedPerPlan: form.exitedPerPlan === '' ? undefined : form.exitedPerPlan === 'yes',
        fees: toNumber(form.fees),
      })}
      onDone={onDone}
    >
      {({ fieldProps, errorFor, form, setForm }) => (
        <>
          <Field id={`${trade.id}-exitPrice`} label="Exit price" error={errorFor('exitPrice')}>
            <input {...fieldProps('exitPrice')} type="number" step="any" required className={inputClass} />
          </Field>
          <Field id={`${trade.id}-closedAt`} label="Exit time" error={errorFor('closedAt')}>
            <input {...fieldProps('closedAt')} type="datetime-local" className={inputClass} />
          </Field>
          <Field id={`${trade.id}-exitReason`} label="Reason" error={errorFor('exitReason')}>
            <select {...fieldProps('exitReason')} className={inputClass}>
              <option value="">Choose…</option>
              {EXIT_REASONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${trade.id}-fees`} label="Fees" error={errorFor('fees')}>
            <input {...fieldProps('fees')} type="number" step="any" min="0" placeholder="0" className={inputClass} />
          </Field>
          <fieldset className="col-span-2">
            <legend className="text-xs font-medium text-gray-500">Did you follow your plan?</legend>
            <div className="mt-1 flex gap-4 text-sm text-gray-700">
              {['yes', 'no'].map((value) => (
                <label key={value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`${trade.id}-exitedPerPlan`}
                    value={value}
                    checked={form.exitedPerPlan === value}
                    onChange={() => setForm((current) => ({ ...current, exitedPerPlan: value }))}
                  />
                  {value === 'yes' ? 'Yes' : 'No'}
                </label>
              ))}
            </div>
            {errorFor('exitedPerPlan') && (
              <p className="mt-1 text-xs text-red-700">{errorFor('exitedPerPlan')}</p>
            )}
          </fieldset>
        </>
      )}
    </StepForm>
  );
}

function Summary({ trade, status }) {
  if (status === 'planned') {
    const target = trade.target ? `, target ${trade.target}` : '';
    return <span>{`Entry ${trade.plannedEntry}, stop ${trade.initialStop}${target}`}</span>;
  }
  if (status === 'open') {
    return <span>{`Filled at ${trade.entryPrice}, stop ${trade.initialStop}`}</span>;
  }

  const pnl = profitLoss(trade);
  const r = rMultiple(trade);
  const tone = pnl >= 0 ? 'text-green-700' : 'text-red-700';
  return (
    <>
      <span>{`${trade.entryPrice} → ${trade.exitPrice}`}</span>
      <span className={`font-medium ${tone}`}>{money.format(pnl)}</span>
      {r !== null && <span className={`font-medium ${tone}`}>{formatR(r)}</span>}
    </>
  );
}

// A trade's status and result on a journal entry. `canRecord` (the plan's own
// entry) adds the buttons to record its entry fill and exit.
export default function TradeProgress({ trade, canRecord }) {
  const [recording, setRecording] = useState(false);
  const status = tradeStatus(trade);
  const nextStep = { planned: 'entry', open: 'exit' }[status];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-gray-600">
        <span className={`rounded px-1.5 ${STATUS_STYLES[status]}`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
        <Summary trade={trade} status={status} />
        {canRecord && nextStep && !recording && (
          <button type="button" onClick={() => setRecording(true)} className={secondaryButtonClass}>
            {`Record ${nextStep}`}
          </button>
        )}
      </div>
      {recording && nextStep === 'entry' && <EntryForm trade={trade} onDone={() => setRecording(false)} />}
      {recording && nextStep === 'exit' && <ExitForm trade={trade} onDone={() => setRecording(false)} />}
    </div>
  );
}
