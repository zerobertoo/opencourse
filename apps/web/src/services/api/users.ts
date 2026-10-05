import { listUsersResponseSchema, userResponseSchema } from '@opencourse/shared';
import type { UserService } from '../users';
import type { ApiClient } from './client';

/** UserService backed by the real API. */
export function createApiUserService(client: ApiClient): UserService {
  const readUser = async (method: 'GET' | 'PATCH', path: string, body?: unknown) =>
    (await client.request(method, path, { body, schema: userResponseSchema })).user;

  return {
    async list(filters = {}) {
      const { users } = await client.request('GET', '/admin/users', {
        query: {
          search: filters.search,
          role: filters.role,
          active: filters.active === undefined ? undefined : String(filters.active),
        },
        schema: listUsersResponseSchema,
      });
      return users;
    },

    getById: (id) => readUser('GET', `/users/${encodeURIComponent(id)}`),

    updateProfile: (input) => readUser('PATCH', '/me', input),

    updateRole: (userId, role) =>
      readUser('PATCH', `/admin/users/${encodeURIComponent(userId)}/role`, { role }),

    setActive: (userId, active) =>
      readUser('PATCH', `/admin/users/${encodeURIComponent(userId)}/active`, { active }),
  };
}
