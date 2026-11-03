'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ThemePicker from './ThemePicker';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/journal', label: 'Journal' },
  { href: '/strategies', label: 'Strategies' },
  { href: '/insights', label: 'Insights' },
  { href: '/import', label: 'Import' },
];

// Clears the session cookie, then shows the login page. Even if the request
// fails, the proxy sends the next signed-out request there anyway.
function SignOut() {
  const router = useRouter();

  async function signOut() {
    await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
    router.replace('/login');
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} className="text-gray-500 hover:text-gray-800">
      Sign out
    </button>
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
          {signedIn && <SignOut />}
        </div>
      </div>
    </nav>
  );
}
