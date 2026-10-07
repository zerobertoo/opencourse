import { grantResponseSchema, listGrantsResponseSchema } from '@opencourse/shared';
import type { GrantService } from '../grants';
import type { ApiClient } from './client';

/** The grant half of `GrantService`, backed by the real API (invites live in `invites.ts`). */
export function createApiGrantService(
  client: ApiClient,
): Pick<GrantService, 'list' | 'create' | 'revoke' | 'extend'> {
  const writeGrant = async (path: string, body?: unknown) =>
    (await client.request('POST', path, { body, schema: grantResponseSchema })).grant;

  return {
    async list(filters = {}) {
      const { grants } = await client.request('GET', '/grants', {
        query: { courseId: filters.courseId, userId: filters.userId, status: filters.status },
        schema: listGrantsResponseSchema,
      });
      return grants;
    },

    // 201 for a new grant and 200 for an extended one: both are a grant the user now has
    create: (input) => writeGrant('/grants', input),

    revoke: (grantId) => writeGrant(`/grants/${encodeURIComponent(grantId)}/revoke`),

    extend: (grantId, expiresAt) =>
      writeGrant(`/grants/${encodeURIComponent(grantId)}/extend`, { expiresAt }),
  };
}
