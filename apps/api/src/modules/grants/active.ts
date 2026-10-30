import { and, gt, isNull, or } from 'drizzle-orm';
import { grants } from '../../db/schema';

/** A grant counts when it is not revoked and has no expiry date or one in the future. */
export function activeGrantCondition(now: Date) {
  return and(isNull(grants.revokedAt), or(isNull(grants.expiresAt), gt(grants.expiresAt, now)));
}
