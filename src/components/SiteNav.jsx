'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ThemePicker from './ThemePicker';
import { isDemo } from '@/lib/demo';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/journal', label: 'Journal' },
  { href: '/strategies', label: 'Strategies' },
  { href: '/performance', label: 'Performance' },
  { href: '/performance-review', label: 'Performance Review' },
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
        <span role="alert" className="text-xs text-red-700">
          Couldn&apos;t sign out. Try again.
        </span>
      )}
      <button type="button" onClick={signOut} className="text-left text-xs text-gray-500 hover:text-gray-800">
        Sign out
      </button>
    </>
  );
}

// The gear in the corner. Theme and Sign out live behind it, since this is a
// single-user app and neither is needed on every visit. Closes with the gear,
// Escape, or a click anywhere outside.
function SettingsMenu({ signedIn, demo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded p-1 text-gray-500 hover:text-gray-800"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path
            fillRule="evenodd"
            d="M8.34 1.8a1 1 0 0 1 .97-.8h1.38a1 1 0 0 1 .97.8l.25 1.27c.43.15.84.33 1.22.55l1.08-.73a1 1 0 0 1 1.28.12l.98.98a1 1 0 0 1 .12 1.28l-.73 1.08c.22.38.4.79.55 1.22l1.27.25a1 1 0 0 1 .8.97v1.38a1 1 0 0 1-.8.97l-1.27.25c-.15.43-.33.84-.55 1.22l.73 1.08a1 1 0 0 1-.12 1.28l-.98.98a1 1 0 0 1-1.28.12l-1.08-.73c-.38.22-.79.4-1.22.55l-.25 1.27a1 1 0 0 1-.97.8H9.31a1 1 0 0 1-.97-.8l-.25-1.27a6.4 6.4 0 0 1-1.22-.55l-1.08.73a1 1 0 0 1-1.28-.12l-.98-.98a1 1 0 0 1-.12-1.28l.73-1.08a6.4 6.4 0 0 1-.55-1.22L2.3 11.3a1 1 0 0 1-.8-.97V8.95a1 1 0 0 1 .8-.97l1.27-.25c.15-.43.33-.84.55-1.22l-.73-1.08a1 1 0 0 1 .12-1.28l.98-.98a1 1 0 0 1 1.28-.12l1.08.73c.38-.22.79-.4 1.22-.55L8.34 1.8ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 flex w-44 flex-col gap-3 rounded-md border border-gray-200 bg-white p-3 text-sm shadow-md">
          <ThemePicker />
          {signedIn && !demo && <SignOut />}
        </div>
      )}
    </div>
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
          {isDemo() && (
            <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">Demo: made-up trades, read-only</span>
          )}
          <SettingsMenu signedIn={signedIn} demo={isDemo()} />
        </div>
      </div>
    </nav>
  );
}
