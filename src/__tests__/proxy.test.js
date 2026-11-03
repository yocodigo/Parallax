// @vitest-environment node
// Next's NextRequest and Node's Web Crypto, as the proxy gets them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// Next 16.4 still names it for middleware, though its docs say unstable_doesProxyMatch.
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/session';
import { config, proxy } from '../proxy';

const SECRET = 's'.repeat(32);

const request = (path, cookie) =>
  new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } } : {});

const passedThrough = (response) => response.headers.get('x-middleware-next') === '1';

beforeEach(() => vi.stubEnv('SESSION_SECRET', SECRET));
afterEach(() => vi.unstubAllEnvs());

describe('proxy', () => {
  it('lets a signed-in request through', async () => {
    const token = await createSessionToken(SECRET);

    expect(passedThrough(await proxy(request('/journal', token)))).toBe(true);
    expect(passedThrough(await proxy(request('/api/journal', token)))).toBe(true);
  });

  it('sends a signed-out page visit to the login page, remembering where it was going', async () => {
    const response = await proxy(request('/journal?mode=live'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/journal?mode=live');
  });

  it('answers a signed-out API call with 401 rather than a redirect', async () => {
    const response = await proxy(request('/api/journal'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Sign in first.' });
  });

  it('treats an expired, forged, or garbled cookie as signed out', async () => {
    const expired = await createSessionToken(SECRET, Date.now() - SESSION_MAX_AGE_SECONDS * 1000 - 1);
    const forged = await createSessionToken('f'.repeat(32));

    for (const cookie of [expired, forged, 'garbage']) {
      expect((await proxy(request('/api/journal', cookie))).status).toBe(401);
    }
  });

  it('leaves the login page and the sign-in route open', async () => {
    expect(passedThrough(await proxy(request('/login?next=/journal')))).toBe(true);
    expect(passedThrough(await proxy(request('/api/session')))).toBe(true);
  });

  it('does not open paths that only start like the open ones', async () => {
    expect((await proxy(request('/login-history'))).status).toBe(307);
    expect((await proxy(request('/api/sessions'))).status).toBe(401);
  });

  it('fails closed when SESSION_SECRET is not set', async () => {
    const token = await createSessionToken(SECRET);
    vi.stubEnv('SESSION_SECRET', '');

    await expect(proxy(request('/journal', token))).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe('proxy in the demo', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true'));

  it('needs no sign-in to read', async () => {
    expect(passedThrough(await proxy(request('/journal')))).toBe(true);
    expect(passedThrough(await proxy(request('/api/journal')))).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('answers 403 to an API %s, signed in or not', async (method) => {
    const token = await createSessionToken(SECRET);
    for (const cookie of [undefined, token]) {
      const response = await proxy(
        new NextRequest('http://localhost/api/journal', {
          method,
          headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
        })
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'The demo is read-only.' });
    }
  });

  it("never shows the trading account's positions", async () => {
    const response = await proxy(request('/api/positions'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "The demo doesn't show account data." });
  });

  it('lets HEAD and OPTIONS through, and a POST to a page (there are no server actions)', async () => {
    for (const method of ['HEAD', 'OPTIONS']) {
      expect(passedThrough(await proxy(new NextRequest('http://localhost/api/journal', { method })))).toBe(true);
    }
    expect(passedThrough(await proxy(new NextRequest('http://localhost/journal', { method: 'POST' })))).toBe(true);
  });

  it('sends the login page to the dashboard, since there is nothing to sign in to', async () => {
    const response = await proxy(request('/login?next=/journal'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')).pathname).toBe('/');
  });

  it('needs no SESSION_SECRET', async () => {
    vi.stubEnv('SESSION_SECRET', '');

    expect(passedThrough(await proxy(request('/journal')))).toBe(true);
  });

  it('is off for any value but "true"', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '1');

    expect((await proxy(request('/api/journal'))).status).toBe(401);
  });
});

describe('proxy matcher', () => {
  // Only the svg files at the site root are static; deeper paths ending in .svg are routes.
  it.each([
    '/',
    '/journal',
    '/insights',
    '/api/journal',
    '/api/trades/1/entry',
    '/login',
    '/api/journal/x.svg',
    '/api/strategies/a.svg',
    '/journal/next.svg',
  ])('runs on %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it.each(['/_next/static/chunks/app.js', '/_next/image?url=x', '/favicon.ico', '/next.svg'])(
    'skips the static file %s',
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    }
  );
});
