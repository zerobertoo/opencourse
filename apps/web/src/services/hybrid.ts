import type { User } from '@opencourse/shared';
import { createApiAuthService, type ApiPreferences } from './api/auth';
import type { ApiClient } from './api/client';
import { createApiInviteService } from './api/invites';
import { createApiUserService } from './api/users';
import type { AuthService } from './auth';
import type { MockServices } from './mock';
import type { Services } from './types';

/**
 * Real API for authentication, users and invites; mock for everything that has no backend yet
 * (courses, enrollments, progress, grants, certificates, settings, studio).
 *
 * The mock services decide what a user may do from "who is signed in". With the real API owning
 * the session, the signed-in user is mirrored into the mock after every auth change, so the
 * mocked screens keep working for real accounts. Real users own no mock courses, so an instructor
 * sees an empty Studio until the courses milestone lands.
 */
export function createHybridServices(
  client: ApiClient,
  mock: MockServices,
  getPreferences?: () => ApiPreferences,
): Services {
  const api = createApiAuthService(client, getPreferences);
  const mirror = <T extends User | null>(user: T): T => {
    mock.mock.setSessionUser(user);
    return user;
  };

  const auth: AuthService = {
    ...api,
    getCurrentUser: async () => mirror(await api.getCurrentUser()),
    signIn: async (email, password) => mirror(await api.signIn(email, password)),
    signUp: async (input) => mirror(await api.signUp(input)),
    acceptInvite: async (token, input) => mirror(await api.acceptInvite(token, input)),
    async signOut() {
      await api.signOut();
      // only after the API confirmed: if the request failed, the real cookies are still valid and
      // the UI still shows the user, so the mock must keep agreeing with both
      mock.mock.setSessionUser(null);
    },
  };

  const apiUsers = createApiUserService(client);
  const users: Services['users'] = {
    ...apiUsers,
    // keep the mirrored copy fresh, or mocked screens would show the old name or role
    updateProfile: async (input) => {
      const user = await apiUsers.updateProfile(input);
      mock.mock.upsertUser(user);
      return user;
    },
    updateRole: async (userId, role) => {
      const user = await apiUsers.updateRole(userId, role);
      mock.mock.upsertUser(user);
      return user;
    },
    setActive: async (userId, active) => {
      const user = await apiUsers.setActive(userId, active);
      mock.mock.upsertUser(user);
      return user;
    },
  };

  return {
    auth,
    users,
    grants: { ...mock.grants, ...createApiInviteService(client) },
    courses: mock.courses,
    curriculum: mock.curriculum,
    enrollments: mock.enrollments,
    progress: mock.progress,
    notes: mock.notes,
    certificates: mock.certificates,
    settings: mock.settings,
    studio: mock.studio,
  };
}
