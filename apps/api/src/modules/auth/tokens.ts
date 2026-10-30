import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** A URL-safe random secret with 256 bits of entropy (refresh, reset and invite tokens). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash stored in the database in place of the token itself. SHA-256 is enough here because the
 * tokens are random, not human-chosen, so there is nothing to brute-force.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const ACCESS_TOKEN_VERSION = 'v1';

/** Short-lived signed token that only names the session; user and role are read from the database. */
export function signAccessToken(
  secret: string,
  sessionId: string,
  ttlSeconds: number,
  now: Date,
): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = `${ACCESS_TOKEN_VERSION}.${sessionId}.${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

/** Returns the session id of a valid, unexpired token, or null. */
export function verifyAccessToken(secret: string, token: string, now: Date): string | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [version, sessionId, expiresAt, signature] = parts as [string, string, string, string];
  if (version !== ACCESS_TOKEN_VERSION) return null;

  const expected = createHmac('sha256', secret)
    .update(`${version}.${sessionId}.${expiresAt}`)
    .digest('base64url');
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry * 1000 <= now.getTime()) return null;
  return sessionId;
}
