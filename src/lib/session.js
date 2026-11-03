// Sign-in for the single user. The session cookie holds `<expiresAt>.<signature>`: the
// expiry in milliseconds and an HMAC-SHA256 of it under SESSION_SECRET. There is nothing
// else to store, since there is only one user; without the secret a token can't be made or
// stretched. Web Crypto, so it runs wherever the proxy does.

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

// Hashing both sides first gives two 32-byte digests, so the comparison takes the same time
// whatever the lengths or the first differing character.
export async function passwordMatches(given, expected) {
  if (typeof expected !== 'string' || expected.length === 0) {
    throw new Error('APP_PASSWORD is not set');
  }
  if (typeof given !== 'string') return false;
  const [a, b] = await Promise.all(
    [given, expected].map(async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))),
  );
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
