import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  clearSignInFailures,
  countSignInFailures,
  pruneSignInFailures,
  recordSignInFailure,
} from '@/db/signIn';
import { withErrorLogging } from '@/lib/log';
import { clientKey } from '@/lib/rateLimit';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  passwordMatches,
} from '@/lib/session';

const ROUTE = '/api/session';
const MAX_FAILURES = 5;
const FAILURE_WINDOW_SECONDS = 15 * 60;

const signInSchema = z.object({
  password: z.string().min(1, 'Enter the password').max(1000, 'That is longer than any password here'),
});

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  sameSite: 'lax',
  // Plain http on localhost would drop a Secure cookie.
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge,
});

// Vercel sets x-real-ip itself, so a client can't pick its own IP to dodge the
// limit, as it could with the first entry of x-forwarded-for. That is only the
// fallback for hosts without it; one shared count would let any visitor lock
// the owner out. Locally there is neither, and attempts share one count.
const clientIp = (request) => request.headers.get('x-real-ip') ?? clientKey(request);

// Signs in with the one password (APP_PASSWORD) and sets the session cookie.
// After MAX_FAILURES wrong passwords from an IP within the window, that IP gets
// 429 until the oldest ages out, right password or not, so guessing can't go on.
// Counting then inserting isn't atomic, so parallel guesses can slip a few past
// the limit; with a long random password that doesn't matter.
export const POST = withErrorLogging(ROUTE, async (request) => {
  const db = getDb();
  const ip = clientIp(request);
  const since = new Date(Date.now() - FAILURE_WINDOW_SECONDS * 1000);

  await pruneSignInFailures(db, since);
  if ((await countSignInFailures(db, ip, since)) >= MAX_FAILURES) {
    return NextResponse.json(
      { error: 'Too many wrong passwords. Try again in 15 minutes.' },
      { status: 429, headers: { 'Retry-After': String(FAILURE_WINDOW_SECONDS) } }
    );
  }

  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid sign-in', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  if (!(await passwordMatches(parsed.data.password, process.env.APP_PASSWORD))) {
    await recordSignInFailure(db, ip);
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }

  await clearSignInFailures(db, ip);
  const response = NextResponse.json({ signedIn: true });
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(process.env.SESSION_SECRET),
    cookieOptions(SESSION_MAX_AGE_SECONDS)
  );
  return response;
});

// Signs out on this browser. A copied cookie stays valid until it expires or
// SESSION_SECRET changes.
export const DELETE = withErrorLogging(ROUTE, async () => {
  const response = NextResponse.json({ signedIn: false });
  response.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return response;
});
