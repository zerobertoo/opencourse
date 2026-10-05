import { createInviteResponseSchema, listInvitesResponseSchema } from '@opencourse/shared';
import type { GrantService } from '../grants';
import type { ApiClient } from './client';

/**
 * The invite half of `GrantService`, backed by the real API. Grants themselves stay with the
 * mock until the courses milestone brings real courses to grant access to.
 */
export function createApiInviteService(
  client: ApiClient,
): Pick<GrantService, 'createInvite' | 'listInvites'> {
  return {
    createInvite: (input) =>
      client.request('POST', '/invites', { body: input, schema: createInviteResponseSchema }),

    async listInvites(filters = {}) {
      const { invites } = await client.request('GET', '/invites', {
        query: { courseId: filters.courseId },
        schema: listInvitesResponseSchema,
      });
      return invites;
    },
  };
}
