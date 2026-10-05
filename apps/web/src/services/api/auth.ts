import {
  inviteResponseSchema,
  sessionResponseSchema,
  type Locale,
  type User,
} from '@opencourse/shared';
import type { AuthService } from '../auth';
import { isServiceError, ServiceError } from '../errors';
import type { ApiClient } from './client';

export interface ApiPreferences {
  locale?: Locale;
  timeZone?: string;
}

/** AuthService backed by the real API. Sessions are cookies, so nothing is stored here. */
export function createApiAuthService(
  client: ApiClient,
  getPreferences: () => ApiPreferences = () => ({}),
): AuthService {
  const startSession = async (
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<User> => {
    const { user } = await client.request(method, path, { body, schema: sessionResponseSchema });
    return user;
  };

  return {
    async getCurrentUser() {
      try {
        return await startSession('GET', '/me');
      } catch (error) {
        // nobody is signed in (the client already tried to refresh): not a failure
        if (isServiceError(error) && error.code === 'unauthorized') return null;
        throw error;
      }
    },

    signIn: (email, password) => startSession('POST', '/auth/login', { email, password }),

    // the demo shortcut only exists in the mock; a real API has no passwordless accounts
    signInAs: () =>
      Promise.reject(
        new ServiceError('unavailable', 'Demo sign-in is not available with a real API'),
      ),

    signUp: (input) => startSession('POST', '/auth/register', { ...input, ...getPreferences() }),

    signOut: () => client.request('POST', '/auth/logout'),

    changePassword: (currentPassword, newPassword) =>
      client.request('PUT', '/me/password', { body: { currentPassword, newPassword } }),

    requestPasswordReset: (email) => client.request('POST', '/auth/forgot', { body: { email } }),

    resetPassword: (token, password) =>
      client.request('POST', '/auth/reset', { body: { token, password } }),

    async getInvite(token) {
      const { invite } = await client.request('GET', `/invites/${encodeURIComponent(token)}`, {
        schema: inviteResponseSchema,
      });
      return invite;
    },

    acceptInvite: (token, input) =>
      startSession('POST', `/invites/${encodeURIComponent(token)}/accept`, {
        ...input,
        ...getPreferences(),
      }),
  };
}
