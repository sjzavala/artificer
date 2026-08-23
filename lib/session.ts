/**
 * Session cookie for the access gate.
 *
 * Uses Web Crypto rather than node:crypto so the exact same verification code
 * runs in Edge middleware and in Node API routes — one implementation, no
 * chance of the two disagreeing about what a valid token looks like.
 */

export const SESSION_COOKIE = 'artificer_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const encoder = new TextEncoder();

function secret(): string {
  const value = process.env.ARTIFICER_SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      'ARTIFICER_SESSION_SECRET is missing or too short. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return value;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Token is `<expiresAtMs>.<hmac>` — stateless, so no server-side session store. */
export async function createSessionToken(now = Date.now()): Promise<string> {
  const expiresAt = now + SESSION_TTL_MS;
  const payload = String(expiresAt);
  const signature = await crypto.subtle.sign('HMAC', await key(), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  try {
    const expected = toBase64Url(await crypto.subtle.sign('HMAC', await key(), encoder.encode(payload)));
    return timingSafeEqual(signature, expected);
  } catch {
    return false;
  }
}

/** Constant-time string compare — avoids leaking the signature byte by byte. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Compares a submitted access code without short-circuiting on first mismatch. */
export function accessCodeMatches(submitted: string): boolean {
  const expected = process.env.ARTIFICER_ACCESS_CODE;
  if (!expected) return false;
  return timingSafeEqual(submitted.trim(), expected.trim());
}
