import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// Open without signing in: the page to sign in on and the route it posts to.
const OPEN_PATHS = new Set(['/login', '/api/session']);

// Every page and API route needs the session cookie. A signed-out page visit
// goes to /login with the path it wanted in `next`; an API call gets 401, since
// a fetch can't follow a redirect to a form. A missing or short SESSION_SECRET
// throws, so a misconfigured deploy fails closed (Next answers 500 and
// instrumentation.js logs it) rather than letting requests through.
export async function proxy(request) {
  const { pathname, search } = request.nextUrl;
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

// Everything but Next's build output and the static files in public/.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico$|.*\\.svg$).*)'],
};
