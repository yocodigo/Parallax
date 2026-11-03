import { NextResponse } from 'next/server';
import { isDemo } from '@/lib/demo';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// Open without signing in: the page to sign in on and the route it posts to.
const OPEN_PATHS = new Set(['/login', '/api/session']);
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Routes that read the Alpaca trading account itself rather than market data.
const ACCOUNT_PATHS = new Set(['/api/positions']);

// Every page and API route needs the session cookie. A signed-out page visit
// goes to /login with the path it wanted in `next`; an API call gets 401, since
// a fetch can't follow a redirect to a form. A missing or short SESSION_SECRET
// throws, so a misconfigured deploy fails closed (Next answers 500 and
// instrumentation.js logs it) rather than letting requests through.
export async function proxy(request) {
  const { pathname, search } = request.nextUrl;
  if (isDemo()) return demo(request, pathname);
  if (OPEN_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, process.env.SESSION_SECRET)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

// The demo has no sign-in and saves nothing: every write to the API answers
// 403, so no visitor can change the seeded data, upload a file, or start a
// paid Claude or ElevenLabs call (those routes are all POSTs).
// Nor does it show the account behind its Alpaca keys.
function demo(request, pathname) {
  if (ACCOUNT_PATHS.has(pathname)) {
    return NextResponse.json({ error: "The demo doesn't show account data." }, { status: 403 });
  }
  if (pathname.startsWith('/api/') && !READ_METHODS.has(request.method)) {
    return NextResponse.json({ error: 'The demo is read-only.' }, { status: 403 });
  }
  return NextResponse.next();
}

// Everything but Next's build output, the favicon, and the svg files at the
// site root (public/ has no folders). An .svg deeper down is a route like any
// other: /api/journal/x.svg must still need a session.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico$|[^/]+\\.svg$).*)'],
};
