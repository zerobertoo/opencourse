import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'pb1';

/** How long a playback address works. The player asks for a new one every time a lesson opens. */
export const PLAYBACK_TOKEN_TTL_SECONDS = 6 * 3600;

export interface PlaybackClaims {
  assetId: string;
  userId: string;
}

function signature(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Signed token naming the asset and the person it was issued to; access is re-checked on every use. */
export function signPlaybackToken(
  secret: string,
  claims: PlaybackClaims,
  ttlSeconds: number,
  now: Date,
): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = `${TOKEN_VERSION}.${claims.assetId}.${claims.userId}.${expiresAt}`;
  return `${payload}.${signature(secret, payload)}`;
}

/** The claims of a valid, unexpired token, or null. */
export function verifyPlaybackToken(
  secret: string,
  token: string,
  now: Date,
): PlaybackClaims | null {
  const parts = token.split('.');
  if (parts.length !== 5) return null;
  const [version, assetId, userId, expiresAt, given] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== TOKEN_VERSION) return null;

  const expected = Buffer.from(signature(secret, `${version}.${assetId}.${userId}.${expiresAt}`));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry * 1000 <= now.getTime()) return null;
  return { assetId, userId };
}
