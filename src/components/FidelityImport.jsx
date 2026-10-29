'use client';

import Link from 'next/link';
import { useState } from 'react';
import { mutate } from 'swr';
import { apiErrorMessage } from '@/lib/fetchJson';
import { formatProfitLoss } from '@/lib/format';
import Field, { inputClass } from './Field';

const MODES = [
  ['live', 'Live'],
  ['paper', 'Paper'],
  ['backtest', 'Backtest'],
];

const ACTIONS = { create: 'New trade', fill: 'Fills in your trade', skip: 'Already imported' };

const buttonClass =
  'rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';
const secondaryButtonClass =
  'rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

// "Oct 9": the trade date. Fidelity's export has no time of day, so every
// fill reads as the New York open, a placeholder not worth showing as if it
// were real.
function formatDate(iso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(
    new Date(iso)
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function PreviewTable({ trades }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="text-left text-xs text-gray-500">
        <tr>
          <th className="py-1 font-medium">Entered</th>
          <th className="py-1 font-medium">Symbol</th>
          <th className="py-1 text-right font-medium">Qty</th>
          <th className="py-1 text-right font-medium">Entry → exit</th>
          <th className="py-1 text-right font-medium">P/L</th>
          <th className="py-1 pl-4 font-medium">Import</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {trades.map((trade) => (
          <tr key={trade.refs[0]} className={trade.action === 'skip' ? 'text-gray-400' : 'text-gray-800'}>
            <td className="py-1.5">{formatDate(trade.openedAt)}</td>
            <td className="py-1.5">
              {trade.symbol}
              {/* More than one buy or sell: the prices are averages. */}
              {trade.fillCount > 2 && (
                <span className="block text-xs text-gray-500">{`averaged from ${trade.fillCount} fills`}</span>
              )}
            </td>
            <td className="py-1.5 text-right">{trade.quantity}</td>
            <td className="py-1.5 text-right">{`${trade.entryPrice} → ${trade.exitPrice ?? 'open'}`}</td>
            <td
              className={`py-1.5 text-right ${
                trade.action === 'skip' || trade.profitLoss === null
                  ? ''
                  : trade.profitLoss < 0
                    ? 'text-red-700'
                    : 'text-green-700'
              }`}
            >
              {trade.profitLoss === null ? '—' : formatProfitLoss(trade.profitLoss)}
            </td>
            <td className="py-1.5 pl-4">{ACTIONS[trade.action]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Leftovers({ unpaired, unreadRows }) {
  if (unpaired.length === 0 && unreadRows.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">Not imported</p>
      <ul className="list-disc space-y-1 pl-5">
        {unpaired.map((group) => (
          <li key={group.fills[0].ref}>
            {`${group.reason}: `}
            {group.fills
              .map((f) => `${f.side === 'buy' ? 'Bought' : 'Sold'} ${f.quantity} ${f.symbol} at ${f.price}, ${formatDate(f.executedAt)}`)
              .join('; ')}
          </li>
        ))}
        {/* No reference number survives the export; the row's own position is
            the only stable key a re-render has to go on. */}
        {unreadRows.map((row, i) => (
          <li key={i}>
            Not understood: <span className="font-mono text-xs">{row.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Imports a Fidelity account history: choose the exported CSV, preview what
// will be created, filled in, or skipped, then confirm.
export default function FidelityImport() {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('live');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // A preview is only good for the choices it was made with.
  const change = (setter) => (value) => {
    setter(value);
    setPreview(null);
    setResult(null);
  };

  async function send(confirm) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const form = new FormData();
    if (file) form.append('file', file, file.name);
    form.append('mode', mode);
    if (confirm) form.append('confirm', 'true');
    try {
      const res = await fetch('/api/imports/fidelity', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFieldErrors(json.fieldErrors ?? {});
        setError(apiErrorMessage(json, 'The import failed. Try again.'));
        return;
      }
      setPreview(json);
      if (confirm) {
        setResult(json);
        mutate('/api/journal');
      }
    } catch {
      setError('The import failed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const toImport = preview?.trades.filter((t) => t.action !== 'skip').length ?? 0;
  // Field-level messages show under their field rather than again on top.
  const generalError = error && Object.keys(fieldErrors).length === 0 ? error : null;

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(false);
        }}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2"
      >
        <Field id="fidelity-import-file" label="Account history (CSV)" error={fieldErrors.file?.[0]} className="sm:col-span-2">
          <input
            id="fidelity-import-file"
            type="file"
            accept=".csv,text/csv"
            aria-invalid={fieldErrors.file ? 'true' : undefined}
            aria-describedby={fieldErrors.file ? 'fidelity-import-file-error' : undefined}
            onChange={(e) => change(setFile)(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </Field>
        <Field id="fidelity-import-mode" label="Mode" error={fieldErrors.mode?.[0]}>
          <select
            id="fidelity-import-mode"
            value={mode}
            onChange={(e) => change(setMode)(e.target.value)}
            className={inputClass}
          >
            {MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <button type="submit" disabled={busy} className={secondaryButtonClass}>
            Preview
          </button>
        </div>
      </form>

      {generalError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {generalError}
        </div>
      )}

      {preview && (
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          {preview.trades.length > 0 ? (
            <PreviewTable trades={preview.trades} />
          ) : (
            <p className="text-sm text-gray-500">No stock trades found in this history.</p>
          )}
          <Leftovers unpaired={preview.unpaired} unreadRows={preview.unreadRows} />

          {result ? (
            <p className="text-sm text-gray-800">
              {`Imported: ${plural(result.created, 'new trade')}, ${result.filled} filled in.`}{' '}
              <Link href="/journal" className="text-blue-700 hover:underline">
                See them in the journal
              </Link>
            </p>
          ) : toImport > 0 ? (
            <button type="button" disabled={busy} onClick={() => send(true)} className={buttonClass}>
              {`Import ${plural(toImport, 'trade')}`}
            </button>
          ) : (
            preview.trades.length > 0 && <p className="text-sm text-gray-500">Nothing new to import.</p>
          )}
        </section>
      )}
    </div>
  );
}
