'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ThemePicker from './ThemePicker';
import { isDemo } from '@/lib/demo';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/journal', label: 'Journal' },
  { href: '/strategies', label: 'Strategies' },
  { href: '/performance', label: 'Performance' },
  { href: '/insights', label: 'Insights' },
  { href: '/import', label: 'Import' },
];

// Clears the session cookie, then shows the login page. If the request fails
// the cookie is still set, so it stays put and says so rather than looking
// signed out on a shared machine.
function SignOut() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setFailed(false);
    const res = await fetch('/api/session', { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setFailed(true);
      return;
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      {failed && (
        <span role="alert" className="text-red-700">
          Couldn&apos;t sign out. Try again.
        </span>
      )}
      <button type="button" onClick={signOut} className="text-gray-500 hover:text-gray-800">
        Sign out
      </button>
    </>
  );
}

export default function SiteNav() {
  const pathname = usePathname();
  // Signed out on the login page, so the links would only lead back to it.
  const signedIn = pathname !== '/login';

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 text-sm">
        {signedIn && LINKS.map(({ href, label }) => {
          const current = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? 'page' : undefined}
              className={`border-b-2 py-3 ${
                current
                  ? 'border-blue-600 font-medium text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </Link>
          );
        })}
        <div className="ml-auto flex items-center gap-4">
          <ThemePicker />
          {isDemo() ? (
            <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">Demo: made-up trades, read-only</span>
          ) : (
            signedIn && <SignOut />
          )}
        </div>
      </div>
    </nav>
  );
}
