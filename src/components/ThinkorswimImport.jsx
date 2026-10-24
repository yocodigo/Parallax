'use client';

import Link from 'next/link';
import { useState } from 'react';
import { mutate } from 'swr';
import { apiErrorMessage } from '@/lib/fetchJson';
import { formatContract, formatProfitLoss } from '@/lib/format';
import Field, { inputClass } from './Field';

// thinkorswim writes times in the zone the platform is set to.
const TIME_ZONES = [
  ['America/Los_Angeles', 'Pacific'],
  ['America/Denver', 'Mountain'],
  ['America/Chicago', 'Central'],
  ['America/New_York', 'Eastern'],
];

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

// "Oct 23, 11:41 AM" in `timeZone`, the one the statement was read in.
function formatTime(iso, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(/ /g, ' ');
}

const contractOf = (item) => [item.symbol, formatContract(item)].filter(Boolean).join(' ');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function PreviewTable({ trades, timeZone }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="text-left text-xs text-gray-500">
        <tr>
          <th className="py-1 font-medium">Entered</th>
          <th className="py-1 font-medium">Contract</th>
          <th className="py-1 text-right font-medium">Qty</th>
          <th className="py-1 text-right font-medium">Entry → exit</th>
          <th className="py-1 text-right font-medium">P/L</th>
          <th className="py-1 pl-4 font-medium">Import</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {trades.map((trade) => (
          <tr key={trade.refs[0]} className={trade.action === 'skip' ? 'text-gray-400' : 'text-gray-800'}>
            <td className="py-1.5">{formatTime(trade.openedAt, timeZone)}</td>
            <td className="py-1.5">
              {contractOf(trade)}
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

function Leftovers({ unpaired, unreadRows, timeZone }) {
  if (unpaired.length === 0 && unreadRows.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">Not imported</p>
      <ul className="list-disc space-y-1 pl-5">
        {unpaired.map((group) => (
          <li key={group.fills[0].ref}>
            {`${group.reason}: `}
            {group.fills
              .map(
                (f) =>
                  `${f.side === 'buy' ? 'Bought' : 'Sold'} ${f.quantity} ${contractOf(f)} at ${f.price}, ${formatTime(f.executedAt, timeZone)}`
              )
              .join('; ')}
          </li>
        ))}
        {unreadRows.map((row) => (
          <li key={row.ref}>
            Not understood: <span className="font-mono text-xs">{row.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Imports a thinkorswim account statement: choose the exported CSV, preview
// what will be created, filled in, or skipped, then confirm.
export default function ThinkorswimImport() {
  const [file, setFile] = useState(null);
  const [timeZone, setTimeZone] = useState('America/Los_Angeles');
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
    form.append('timeZone', timeZone);
    form.append('mode', mode);
    if (confirm) form.append('confirm', 'true');
    try {
      const res = await fetch('/api/imports/thinkorswim', { method: 'POST', body: form });
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
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-3"
      >
        <Field id="import-file" label="Account statement (CSV)" error={fieldErrors.file?.[0]} className="sm:col-span-3">
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            aria-invalid={fieldErrors.file ? 'true' : undefined}
            aria-describedby={fieldErrors.file ? 'import-file-error' : undefined}
            onChange={(e) => change(setFile)(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </Field>
        <Field id="import-timeZone" label="thinkorswim time zone" error={fieldErrors.timeZone?.[0]}>
          <select
            id="import-timeZone"
            value={timeZone}
            onChange={(e) => change(setTimeZone)(e.target.value)}
            className={inputClass}
          >
            {TIME_ZONES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="import-mode" label="Mode" error={fieldErrors.mode?.[0]}>
          <select id="import-mode" value={mode} onChange={(e) => change(setMode)(e.target.value)} className={inputClass}>
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
            <PreviewTable trades={preview.trades} timeZone={timeZone} />
          ) : (
            <p className="text-sm text-gray-500">No option trades found in this statement.</p>
          )}
          <Leftovers unpaired={preview.unpaired} unreadRows={preview.unreadRows} timeZone={timeZone} />

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
