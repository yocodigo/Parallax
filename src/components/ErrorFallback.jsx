'use client';

import { useEffect } from 'react';

const buttonClass =
  'rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';

// Shown by the app's error boundaries (app/error.js, app/global-error.js)
// when a page crashes. A server error carries a digest, the id
// onRequestError logged it under; an error from the browser has none, and
// its details only reach the browser console.
export default function ErrorFallback({ error, retry }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-gray-600">This page hit an unexpected error. Trying again often works.</p>
      {error?.digest && <p className="mt-2 font-mono text-xs text-gray-500">Reference: {error.digest}</p>}
      <button type="button" onClick={() => retry()} className={`${buttonClass} mt-6`}>
        Try again
      </button>
    </main>
  );
}
