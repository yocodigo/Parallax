'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Field, { inputClass } from './Field';
import { apiErrorMessage } from '@/lib/fetchJson';

// The one password. On success the session cookie is set by the response, so
// going on to `next` (already checked by the page) is enough; refresh makes the
// server render it signed in.
export default function SignInForm({ next }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      const json = await res.json().catch(() => ({}));
      const passwordError = json.fieldErrors?.password?.[0];
      if (passwordError) setFieldError(passwordError);
      else setError(apiErrorMessage(json, 'Could not sign in. Try again.'));
    } catch {
      setError('Could not reach the server. Try again.');
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field id="password" label="Password" error={fieldError}>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={fieldError ? 'true' : undefined}
          aria-describedby={fieldError ? 'password-error' : undefined}
          className={inputClass}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
