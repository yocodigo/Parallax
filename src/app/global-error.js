'use client';

import './globals.css';
import ErrorFallback from '@/components/ErrorFallback';

// Catches errors in the root layout itself. It replaces the layout, so it
// brings its own <html>, <body>, and styles.
export default function GlobalError({ error, retry }) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900">
        <title>Something went wrong</title>
        <ErrorFallback error={error} retry={retry} />
      </body>
    </html>
  );
}
