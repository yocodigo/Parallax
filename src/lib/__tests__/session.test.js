// @vitest-environment node
// Node's Web Crypto, which the proxy and route handlers use, not jsdom's.
import { describe, expect, it } from 'vitest';
import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  passwordMatches,
  verifySessionToken,
} from '../session';

const SECRET = 'a'.repeat(32);
const OTHER_SECRET = 'b'.repeat(32);
const NOW = Date.UTC(2026, 10, 2, 15, 0, 0);
const MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

describe('session tokens', () => {
  it('verifies a token signed with the same secret', async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(true);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await createSessionToken(OTHER_SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(false);
  });

  it('holds until the max age and expires after it', async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW + MAX_AGE_MS - 1)).toBe(true);
    expect(await verifySessionToken(token, SECRET, NOW + MAX_AGE_MS)).toBe(false);
  });

  it('rejects a token whose expiry was pushed later', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const [expiresAt, signature] = token.split('.');
    const forged = `${Number(expiresAt) + MAX_AGE_MS}.${signature}`;
    expect(await verifySessionToken(forged, SECRET, NOW)).toBe(false);
  });

  it.each([undefined, null, '', 'abc', '.', `${NOW + MAX_AGE_MS}.`, 'soon.c2ln', '1.2.3'])(
    'rejects the malformed token %j',
    async (token) => {
      expect(await verifySessionToken(token, SECRET, NOW)).toBe(false);
    },
  );

  it('refuses a secret shorter than 32 characters', async () => {
    const short = 'a'.repeat(31);
    await expect(createSessionToken(short, NOW)).rejects.toThrow(/SESSION_SECRET/);
    await expect(verifySessionToken('1.abc', short, NOW)).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe('passwordMatches', () => {
  const PASSWORD = 'correct horse battery staple';

  it('matches the same password', async () => {
    expect(await passwordMatches(PASSWORD, PASSWORD)).toBe(true);
  });

  it.each(['correct horse battery stapl', 'correct horse battery staple!', 'Correct horse battery staple', '', undefined])(
    'does not match %j',
    async (given) => {
      expect(await passwordMatches(given, PASSWORD)).toBe(false);
    },
  );

  it('refuses an empty expected password', async () => {
    await expect(passwordMatches('', '')).rejects.toThrow(/APP_PASSWORD/);
  });
});
