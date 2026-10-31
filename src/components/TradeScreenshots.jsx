'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { apiErrorMessage, fetchJson } from '@/lib/fetchJson';
import { MAX_SCREENSHOTS_PER_TRADE } from '@/lib/screenshot';
import Field, { inputClass } from './Field';

const buttonClass =
  'rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50';
const secondaryButtonClass =
  'rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50';

const LABELS = { setup: 'Setup', entry: 'Entry', exit: 'Exit' };

// The chart screenshots attached to a trade, with a form to add one. Images
// are served by the API (private, cached by the browser), so they load as
// plain <img> tags rather than through SWR.
export default function TradeScreenshots({ tradeId }) {
  const url = `/api/trades/${tradeId}/screenshots`;
  const { data, error, isLoading, mutate } = useSWR(url, fetchJson, { revalidateOnFocus: false });
  const [label, setLabel] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  async function upload(event) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const body = new FormData();
      const file = event.currentTarget.elements.image.files[0];
      if (file) body.append('image', file);
      body.append('label', label);
      const res = await fetch(url, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFieldErrors(json.fieldErrors ?? {});
        setFormError(apiErrorMessage(json, 'Could not save the screenshot'));
        return;
      }
      setLabel('');
      setFileKey((key) => key + 1);
      await mutate();
    } catch {
      setFormError('Could not reach the server');
    } finally {
      setSaving(false);
    }
  }

  async function remove(shot) {
    if (!window.confirm('Remove this screenshot?')) return;
    setFormError(null);
    try {
      const res = await fetch(`${url}/${shot.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setFormError(apiErrorMessage(json, 'Could not remove the screenshot'));
        return;
      }
      await mutate();
    } catch {
      setFormError('Could not reach the server');
    }
  }

  if (isLoading) return <p className="text-xs text-gray-500">Loading screenshots…</p>;
  if (error) return <p className="text-xs text-red-700">{error.message}</p>;

  const shots = data.screenshots;
  const full = shots.length >= MAX_SCREENSHOTS_PER_TRADE;

  return (
    <div className="space-y-2 rounded-md bg-gray-50 p-3 text-xs">
      {shots.length === 0 ? (
        <p className="text-gray-500">No screenshots yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {shots.map((shot) => {
            const name = shot.label ? `${LABELS[shot.label]} screenshot` : 'Screenshot';
            return (
              <li key={shot.id} className="space-y-1">
                <a href={`${url}/${shot.id}`} target="_blank" rel="noreferrer">
                  {/* A user's own upload, served by the API; next/image has nothing to optimize. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${url}/${shot.id}`}
                    alt={name}
                    className="max-h-40 rounded border border-gray-300"
                  />
                </a>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-600">{shot.label ? LABELS[shot.label] : 'No label'}</span>
                  <button
                    type="button"
                    onClick={() => remove(shot)}
                    aria-label={`Remove ${name.toLowerCase()}`}
                    className="text-red-700 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {full ? (
        <p className="text-gray-500">{`A trade can have at most ${MAX_SCREENSHOTS_PER_TRADE} screenshots.`}</p>
      ) : (
        <form onSubmit={upload} className="flex flex-wrap items-end gap-2">
          <Field id={`shot-image-${tradeId}`} label="Screenshot image" error={fieldErrors.image?.[0]}>
            <input
              key={fileKey}
              id={`shot-image-${tradeId}`}
              name="image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-invalid={Boolean(fieldErrors.image)}
              aria-describedby={fieldErrors.image ? `shot-image-${tradeId}-error` : undefined}
              className="text-xs"
            />
          </Field>
          <Field id={`shot-label-${tradeId}`} label="Label" error={fieldErrors.label?.[0]}>
            <select
              id={`shot-label-${tradeId}`}
              name="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {Object.entries(LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" disabled={saving} className={buttonClass}>
            {saving ? 'Uploading…' : 'Upload'}
          </button>
        </form>
      )}
      {formError && <p className="text-red-700">{formError}</p>}
    </div>
  );
}
