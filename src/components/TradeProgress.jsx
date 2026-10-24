'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { BREAKER_LABELS, describeBreaker } from '@/lib/circuitBreakers';
import { apiErrorMessage, fetchJson } from '@/lib/fetchJson';
import { formatProfitLoss, formatR } from '@/lib/format';
import { profitLoss, rMultiple, tradeStatus } from '@/lib/tradeMetrics';
import Field, { inputClass } from './Field';
import TradeContext from './TradeContext';

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

// A small form posting one step (entry or exit) of a trade. Fields render
// through `children({ fieldProps, errorFor, form, setForm })`; `toBody(form)`
// builds the request.
function StepForm({ trade, step, initial, toBody, submitLabel, onDone, children }) {
  const { mutate } = useSWRConfig();
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  // What refused the step (tripped circuit breakers, rules not met) until the
  // trader overrides it: { breakers?, unmetRules? }.
  const [blocked, setBlocked] = useState(null);
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

  // `extra` is added to the body; { override: true } records past a breaker.
  const send = async (extra = {}) => {
    setSaving(true);
    setError(null);
    setBlocked(null);

    try {
      const res = await fetch(`/api/trades/${trade.id}/${step}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...toBody(form), ...extra }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409 && (json.breakers || json.unmetRules)) {
        setBlocked(json);
        return;
      }

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

  const submit = (e) => {
    e.preventDefault();
    send();
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
      {blocked && (
        <div role="alert" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {blocked.breakers && (
            <>
              <p className="font-medium">A circuit breaker you set is tripped.</p>
              <ul className="list-disc pl-4">
                {blocked.breakers.map((b) => (
                  <li key={b.breaker}>{describeBreaker(b)}</li>
                ))}
              </ul>
            </>
          )}
          {blocked.unmetRules && (
            <>
              <p className="font-medium">You marked these rules as not met:</p>
              <ul className="list-disc pl-4">
                {blocked.unmetRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </>
          )}
          <button
            type="button"
            onClick={() => send({ override: true })}
            disabled={saving}
            className={secondaryButtonClass}
          >
            Record anyway
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}
    </form>
  );
}

// The plan's strategy rules, each answered met or not met before entering.
function Checklist({ trade, rules, form, setForm, error }) {
  const answer = (ruleId, met) =>
    setForm((current) => ({ ...current, ruleChecks: { ...current.ruleChecks, [ruleId]: met } }));

  return (
    <div className="col-span-full space-y-1.5">
      <p className="text-xs font-medium text-gray-500">Checklist</p>
      {rules.map((rule) => (
        <fieldset key={rule.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <legend className="sr-only">{rule.text}</legend>
          <span aria-hidden="true" className="text-gray-800">
            {rule.text}
          </span>
          <div className="flex gap-3 text-gray-700">
            {[
              [true, 'Met'],
              [false, 'Not met'],
            ].map(([met, label]) => (
              <label key={label} className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`${trade.id}-rule-${rule.id}`}
                  checked={form.ruleChecks[rule.id] === met}
                  onChange={() => answer(rule.id, met)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

function EntryForm({ trade, onDone }) {
  const { data } = useSWR(trade.strategyId ? '/api/strategies' : null, fetchJson, { revalidateOnFocus: false });
  const rules = data?.strategies.find((s) => s.id === trade.strategyId)?.rules ?? [];

  return (
    <StepForm
      trade={trade}
      step="entry"
      submitLabel="Save entry"
      initial={{ entryPrice: '', openedAt: toLocalInput(new Date()), ruleChecks: {} }}
      toBody={(form) => ({
        entryPrice: toNumber(form.entryPrice),
        openedAt: toIso(form.openedAt),
        // Only rules answered; the server asks about any left out.
        ...(rules.length > 0 && { ruleChecks: form.ruleChecks }),
      })}
      onDone={onDone}
    >
      {({ fieldProps, errorFor, form, setForm }) => (
        <>
          <Field id={`${trade.id}-entryPrice`} label="Fill price" error={errorFor('entryPrice')}>
            <input {...fieldProps('entryPrice')} type="number" step="any" required className={inputClass} />
          </Field>
          <Field id={`${trade.id}-openedAt`} label="Fill time" error={errorFor('openedAt')}>
            <input {...fieldProps('openedAt')} type="datetime-local" className={inputClass} />
          </Field>
          {rules.length > 0 && (
            <Checklist trade={trade} rules={rules} form={form} setForm={setForm} error={errorFor('ruleChecks')} />
          )}
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
  // Option trades may have no stop.
  const stop = trade.initialStop === null ? '' : `, stop ${trade.initialStop}`;
  if (status === 'planned') {
    const target = trade.target ? `, target ${trade.target}` : '';
    return <span>{`Entry ${trade.plannedEntry}${stop}${target}`}</span>;
  }
  if (status === 'open') {
    return <span>{`Filled at ${trade.entryPrice}${stop}`}</span>;
  }

  const pnl = profitLoss(trade);
  const r = rMultiple(trade);
  const tone = pnl >= 0 ? 'text-green-700' : 'text-red-700';
  return (
    <>
      <span>{`${trade.entryPrice} → ${trade.exitPrice}`}</span>
      <span className={`font-medium ${tone}`}>{formatProfitLoss(pnl)}</span>
      {r !== null && <span className={`font-medium ${tone}`}>{formatR(r)}</span>}
    </>
  );
}

// How far the price went against the trade and in its favor while it was open,
// in R. Only stocks that have been entered are measured; anything else, or a
// failed request, simply shows nothing.
function Excursions({ trade, status }) {
  const measurable = status !== 'planned' && trade.assetClass === 'stock';
  const { data } = useSWR(measurable ? `/api/trades/${trade.id}/excursions` : null, fetchJson, {
    revalidateOnFocus: false,
  });

  const result = data?.excursions;
  if (!result || result.maeR === null) return null;

  return (
    <span className="text-gray-500">
      <abbr title="Maximum adverse excursion: the furthest the price went against the trade" className="no-underline">
        MAE
      </abbr>{' '}
      <span className="text-red-700">{formatR(-result.maeR)}</span>
      {' · '}
      <abbr title="Maximum favorable excursion: the furthest the price went in the trade's favor" className="no-underline">
        MFE
      </abbr>{' '}
      <span className="text-green-700">{formatR(result.mfeR)}</span>
    </span>
  );
}

// A trade's status and result on a journal entry. `canRecord` (the plan's own
// entry) adds the buttons to record its entry fill and exit.
export default function TradeProgress({ trade, canRecord }) {
  const [recording, setRecording] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const status = tradeStatus(trade);
  const nextStep = { planned: 'entry', open: 'exit' }[status];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-gray-600">
        <span className={`rounded px-1.5 ${STATUS_STYLES[status]}`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
        <Summary trade={trade} status={status} />
        <Excursions trade={trade} status={status} />
        {trade.overriddenBreakers?.length > 0 && (
          <span className="rounded bg-amber-100 px-1.5 text-amber-900">
            {`Overrode: ${trade.overriddenBreakers.map((b) => BREAKER_LABELS[b] ?? b).join(', ')}`}
          </span>
        )}
        {status !== 'planned' && (
          <button
            type="button"
            onClick={() => setShowContext((shown) => !shown)}
            aria-expanded={showContext}
            className={secondaryButtonClass}
          >
            Context at entry
          </button>
        )}
        {canRecord && nextStep && !recording && (
          <button type="button" onClick={() => setRecording(true)} className={secondaryButtonClass}>
            {`Record ${nextStep}`}
          </button>
        )}
      </div>
      {showContext && (
        <div className="mt-2">
          <TradeContext tradeId={trade.id} />
        </div>
      )}
      {recording && nextStep === 'entry' && <EntryForm trade={trade} onDone={() => setRecording(false)} />}
      {recording && nextStep === 'exit' && <ExitForm trade={trade} onDone={() => setRecording(false)} />}
    </div>
  );
}
