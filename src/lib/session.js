// Sign-in for the single user. The session cookie holds `<expiresAt>.<signature>`: the
// expiry in milliseconds and an HMAC-SHA256 of it under SESSION_SECRET. There is nothing
// else to store, since there is only one user; without the secret a token can't be made or
// stretched. Signing out clears the cookie but can't revoke a copy of it; changing
// SESSION_SECRET signs out everywhere. Web Crypto plus Node's Buffer, so it needs the Node.js
// runtime, which Next 16's proxy always uses.

export const SESSION_COOKIE = 'parallax_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

async function hmacKey(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function createSessionToken(secret, now = Date.now()) {
  const key = await hmacKey(secret);
  const expiresAt = String(now + SESSION_MAX_AGE_SECONDS * 1000);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(expiresAt));
  return `${expiresAt}.${Buffer.from(signature).toString('base64url')}`;
}

export async function verifySessionToken(token, secret, now = Date.now()) {
  const key = await hmacKey(secret);
  const match = /^(\d+)\.([A-Za-z0-9_-]+)$/.exec(token ?? '');
  if (!match) return false;
  const [, expiresAt, signature] = match;
  // subtle.verify compares in constant time, so the signature can't be guessed byte by byte.
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    Buffer.from(signature, 'base64url'),
    encoder.encode(expiresAt),
  );
  return valid && now < Number(expiresAt);
}

const sha256 = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));

// Hashing both sides first gives two 32-byte digests, so the comparison takes the same time
// whatever the lengths. The loop ORs together every byte's difference and never stops early,
// unlike === or Buffer.equals, so the time doesn't show where the first mismatch is.
export async function passwordMatches(given, expected) {
  if (typeof expected !== 'string' || expected.length === 0) {
    throw new Error('APP_PASSWORD is not set');
  }
  if (typeof given !== 'string') return false;
  const a = await sha256(given);
  const b = await sha256(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Where to go after signing in: a path on this site, never another site
// ("//host" and "/\host" are both read by browsers as one, and browsers drop
// tabs and newlines, so "/\t/host" is too) and never back to the login page.
export function safeNextPath(next) {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(next)) return '/';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next === '/login' || next.startsWith('/login?')) return '/';
  return next;
}
