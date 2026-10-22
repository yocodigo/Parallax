'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { apiErrorMessage, fetchJson } from '@/lib/fetchJson';
import Field, { inputClass } from './Field';

const KEY = '/api/strategies';

const buttonClass =
  'rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';
const secondaryButtonClass =
  'rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40';
const iconButtonClass = 'rounded px-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30';

const KINDS = [
  ['edge', 'Edge rules', 'Edge: the setup'],
  ['discipline', 'Discipline rules', 'Discipline: risk and process'],
];

function StrategyCard({ strategy, onEdit }) {
  const headingId = `strategy-${strategy.id}`;
  return (
    <article aria-labelledby={headingId} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-sm font-semibold text-gray-800">
            {strategy.name}
          </h2>
          {strategy.description && <p className="mt-1 text-sm text-gray-600">{strategy.description}</p>}
        </div>
        <button type="button" onClick={onEdit} className={secondaryButtonClass}>
          Edit
        </button>
      </div>
      {KINDS.map(([kind, label]) => {
        const rules = strategy.rules.filter((rule) => rule.kind === kind);
        if (rules.length === 0) return null;
        return (
          <div key={kind}>
            <h3 className="text-xs font-medium text-gray-500">{label}</h3>
            <ul aria-label={label} className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-800">
              {rules.map((rule) => (
                <li key={rule.id}>{rule.text}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </article>
  );
}

// Creates a strategy, or edits `strategy`. Rules keep their ids so editing
// one keeps the trades checked against it linked.
function StrategyForm({ strategy, onDone }) {
  const { mutate } = useSWRConfig();
  const [name, setName] = useState(strategy?.name ?? '');
  const [description, setDescription] = useState(strategy?.description ?? '');
  const [rules, setRules] = useState(
    () => strategy?.rules.map(({ id, text, kind }) => ({ id, text, kind })) ?? [{ text: '', kind: 'edge' }]
  );
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const errorFor = (field) => fieldErrors[field]?.[0];
  const setRule = (index, changes) =>
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...changes } : rule)));
  const move = (index, by) =>
    setRules((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  const remove = (index) => setRules((current) => current.filter((_, i) => i !== index));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(strategy ? `${KEY}/${strategy.id}` : KEY, {
        method: strategy ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, rules }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(apiErrorMessage(json, 'Could not save the strategy'));
        setFieldErrors(json.fieldErrors || {});
        return;
      }

      await mutate(KEY);
      onDone();
    } catch {
      setError('Could not save the strategy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-blue-200 bg-white p-4">
      <Field id="strategy-name" label="Name" error={errorFor('name')}>
        <input
          id="strategy-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errorFor('name') ? true : undefined}
          aria-describedby={errorFor('name') ? 'strategy-name-error' : undefined}
          className={inputClass}
        />
      </Field>
      <Field id="strategy-description" label="Description" error={errorFor('description')}>
        <textarea
          id="strategy-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Optional: what the setup is and when it works"
          className={inputClass}
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-gray-500">Rules, in checklist order</legend>
        {rules.map((rule, index) => {
          const n = index + 1;
          return (
            <div key={rule.id ?? `new-${index}`} className="flex items-center gap-2">
              <input
                aria-label={`Rule ${n}`}
                value={rule.text}
                onChange={(e) => setRule(index, { text: e.target.value })}
                className={inputClass}
              />
              <select
                aria-label={`Rule ${n} kind`}
                value={rule.kind}
                onChange={(e) => setRule(index, { kind: e.target.value })}
                className={`${inputClass} w-56`}
              >
                {KINDS.map(([kind, , label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Move rule ${n} up`}
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className={iconButtonClass}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move rule ${n} down`}
                onClick={() => move(index, 1)}
                disabled={index === rules.length - 1}
                className={iconButtonClass}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove rule ${n}`}
                onClick={() => remove(index)}
                className={iconButtonClass}
              >
                ✕
              </button>
            </div>
          );
        })}
        {errorFor('rules') && <p className="text-xs text-red-700">{errorFor('rules')}</p>}
        <button
          type="button"
          onClick={() => setRules((current) => [...current, { text: '', kind: 'edge' }])}
          className={secondaryButtonClass}
        >
          Add rule
        </button>
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={buttonClass}>
          Save strategy
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
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

// The trader's strategies and their checklists, with a form to add or edit one.
export default function Strategies() {
  const { data, error, isLoading } = useSWR(KEY, fetchJson, { revalidateOnFocus: false });
  // null, 'new', or the id of the strategy being edited.
  const [editing, setEditing] = useState(null);

  if (isLoading) return <p className="text-sm text-gray-500">Loading strategies…</p>;
  if (error) {
    return (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error.message}
      </div>
    );
  }

  const strategies = data.strategies;
  return (
    <div className="space-y-4">
      {strategies.length === 0 && editing !== 'new' && (
        <p className="text-sm text-gray-500">No strategies yet. Add one to get a checklist when you enter a trade.</p>
      )}
      {strategies.map((strategy) =>
        editing === strategy.id ? (
          <StrategyForm key={strategy.id} strategy={strategy} onDone={() => setEditing(null)} />
        ) : (
          <StrategyCard key={strategy.id} strategy={strategy} onEdit={() => setEditing(strategy.id)} />
        )
      )}
      {editing === 'new' ? (
        <StrategyForm onDone={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing('new')} className={secondaryButtonClass}>
          New strategy
        </button>
      )}
    </div>
  );
}
