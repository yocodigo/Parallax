'use client';

import ErrorFallback from '@/components/ErrorFallback';

// Catches errors in any page below the root layout, so the site nav stays up.
export default function Error({ error, retry }) {
  return <ErrorFallback error={error} retry={retry} />;
}
