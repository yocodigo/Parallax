import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import { countSignInFailures, recordSignInFailure } from '@/db/signIn';
import { resetDb } from '@/db/testing';
import { SESSION_MAX_AGE_SECONDS, verifySessionToken } from '@/lib/session';
import { captureErrorLogs } from '@/mocks/logs';
import { DELETE, POST } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});

const PASSWORD = 'correct horse battery staple';
const SECRET = 's'.repeat(32);
const IP = '203.0.113.7';
const OTHER_IP = '198.51.100.4';
const EPOCH = new Date(0);

// x-forwarded-for is what a client could forge; it changes on every call and
// must not split the count.
let forged = 0;
const signIn = (body, ip = IP) =>
  POST(
    new Request('http://localhost/api/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-real-ip': ip,
        'x-forwarded-for': `192.0.2.${++forged}`,
      },
      body: JSON.stringify(body),
    })
  );

const sessionCookie = (response) =>
  response.headers.getSetCookie().find((cookie) => cookie.startsWith('parallax_session='));

beforeEach(async () => {
  vi.stubEnv('APP_PASSWORD', PASSWORD);
  vi.stubEnv('SESSION_SECRET', SECRET);
  await resetDb(getDb());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
afterAll(() => getDb().$client.end());

describe('POST /api/session', () => {
  it('signs in with the right password and sets a signed httpOnly cookie', async () => {
    const response = await signIn({ password: PASSWORD });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signedIn: true });
    const cookie = sessionCookie(response);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(new RegExp(`Max-Age=${SESSION_MAX_AGE_SECONDS}`));
    const token = decodeURIComponent(cookie.split(';')[0].split('=')[1]);
    expect(await verifySessionToken(token, SECRET)).toBe(true);
  });

  it('answers 401 for a wrong password, sets no cookie, and counts the failure', async () => {
    const response = await signIn({ password: 'guess' });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Wrong password.' });
    expect(sessionCookie(response)).toBeUndefined();
    expect(await countSignInFailures(getDb(), IP, EPOCH)).toBe(1);
  });

  it('answers 400 with a field error when the password is missing', async () => {
    const response = await signIn({});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.fieldErrors.password).toBeDefined();
    expect(await countSignInFailures(getDb(), IP, EPOCH)).toBe(0);
  });

  it('refuses an IP after 5 wrong passwords in 15 minutes, even with the right one', async () => {
    for (let i = 0; i < 5; i++) await signIn({ password: 'guess' });

    const response = await signIn({ password: PASSWORD });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('900');
    expect(sessionCookie(response)).toBeUndefined();
    expect((await signIn({ password: PASSWORD }, OTHER_IP)).status).toBe(200);
  });

  it('forgets failures older than 15 minutes', async () => {
    const old = new Date(Date.now() - 16 * 60 * 1000);
    for (let i = 0; i < 5; i++) await recordSignInFailure(getDb(), IP, old);

    const response = await signIn({ password: PASSWORD });

    expect(response.status).toBe(200);
    expect(await countSignInFailures(getDb(), IP, EPOCH)).toBe(0);
  });

  it("clears the IP's failures after a successful sign-in", async () => {
    await signIn({ password: 'guess' });
    await signIn({ password: PASSWORD });

    expect(await countSignInFailures(getDb(), IP, EPOCH)).toBe(0);
  });

  it('answers 500 and logs when APP_PASSWORD is not set', async () => {
    vi.stubEnv('APP_PASSWORD', '');
    const logs = captureErrorLogs();

    const response = await signIn({ password: 'anything' });

    expect(response.status).toBe(500);
    expect(sessionCookie(response)).toBeUndefined();
    expect(logs()[0].error.message).toMatch(/APP_PASSWORD/);
  });
});

describe('DELETE /api/session', () => {
  it('signs out by expiring the cookie', async () => {
    const response = await DELETE(new Request('http://localhost/api/session', { method: 'DELETE' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signedIn: false });
    expect(sessionCookie(response)).toMatch(/Max-Age=0/);
  });
});
