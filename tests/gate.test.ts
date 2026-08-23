import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  accessCodeMatches,
  createSessionToken,
  timingSafeEqual,
  verifySessionToken,
  SESSION_TTL_MS,
} from '@/lib/session';
import { rateLimit, resetRateLimits } from '@/lib/rate-limit';

/**
 * The gate is the only thing standing between a public URL and a live API key,
 * so its failure modes are worth pinning down: no unsigned token accepted, no
 * expired token accepted, and no unlimited guessing.
 */

const SECRET = 'a'.repeat(48);

beforeEach(() => {
  process.env.ARTIFICER_SESSION_SECRET = SECRET;
  process.env.ARTIFICER_ACCESS_CODE = 'covenant-4387';
  resetRateLimits();
});

afterEach(() => {
  delete process.env.ARTIFICER_SESSION_SECRET;
  delete process.env.ARTIFICER_ACCESS_CODE;
});

describe('session tokens', () => {
  it('round-trips a freshly issued token', async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });

  it('rejects a token whose signature was tampered with', async () => {
    const token = await createSessionToken();
    const [payload, signature] = token.split('.');
    const flipped = signature.startsWith('A') ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
    expect(await verifySessionToken(`${payload}.${flipped}`)).toBe(false);
  });

  it('rejects a token whose expiry was extended without re-signing', async () => {
    const token = await createSessionToken();
    const [, signature] = token.split('.');
    expect(await verifySessionToken(`${Date.now() + 10 * SESSION_TTL_MS}.${signature}`)).toBe(false);
  });

  it('rejects an expired token', async () => {
    const issuedLongAgo = await createSessionToken(Date.now() - 2 * SESSION_TTL_MS);
    expect(await verifySessionToken(issuedLongAgo)).toBe(false);
  });

  it('rejects tokens signed with a different secret', async () => {
    const token = await createSessionToken();
    process.env.ARTIFICER_SESSION_SECRET = 'b'.repeat(48);
    expect(await verifySessionToken(token)).toBe(false);
  });

  it('rejects missing and malformed tokens', async () => {
    for (const bad of [undefined, '', 'not-a-token', '.sig', '123456789']) {
      expect(await verifySessionToken(bad as string | undefined), String(bad)).toBe(false);
    }
  });

  it('refuses to issue a token when the secret is too weak to be meaningful', async () => {
    process.env.ARTIFICER_SESSION_SECRET = 'short';
    await expect(createSessionToken()).rejects.toThrow(/ARTIFICER_SESSION_SECRET/);
  });
});

describe('accessCodeMatches', () => {
  it('accepts the configured code, tolerating surrounding whitespace', () => {
    expect(accessCodeMatches('covenant-4387')).toBe(true);
    expect(accessCodeMatches('  covenant-4387 ')).toBe(true);
  });

  it('rejects a near miss, a prefix and an empty code', () => {
    for (const bad of ['covenant-4386', 'covenant', '', 'COVENANT-4387']) {
      expect(accessCodeMatches(bad), bad).toBe(false);
    }
  });

  it('denies everything when no code is configured', () => {
    delete process.env.ARTIFICER_ACCESS_CODE;
    expect(accessCodeMatches('anything')).toBe(false);
    expect(accessCodeMatches('')).toBe(false);
  });
});

describe('timingSafeEqual', () => {
  it('compares equal and unequal strings correctly', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('rateLimit', () => {
  it('allows attempts up to the limit and denies the next one', () => {
    for (let i = 0; i < 8; i += 1) expect(rateLimit('ip:1', { limit: 8 }).allowed).toBe(true);
    expect(rateLimit('ip:1', { limit: 8 }).allowed).toBe(false);
  });

  it('counts each key independently', () => {
    for (let i = 0; i < 8; i += 1) rateLimit('ip:1', { limit: 8 });
    expect(rateLimit('ip:2', { limit: 8 }).allowed).toBe(true);
  });

  it('reports how long to wait once blocked', () => {
    for (let i = 0; i < 3; i += 1) rateLimit('ip:3', { limit: 2, windowMs: 60_000 });
    const blocked = rateLimit('ip:3', { limit: 2, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('opens a fresh window once the previous one has passed', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i += 1) rateLimit('ip:4', { limit: 2, windowMs: 1_000, now });
    expect(rateLimit('ip:4', { limit: 2, windowMs: 1_000, now }).allowed).toBe(false);
    expect(rateLimit('ip:4', { limit: 2, windowMs: 1_000, now: now + 1_500 }).allowed).toBe(true);
  });
});
