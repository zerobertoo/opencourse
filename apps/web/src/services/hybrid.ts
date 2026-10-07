import type { User } from '@opencourse/shared';
import { createApiAuthService, type ApiPreferences } from './api/auth';
import type { ApiClient } from './api/client';
import { createApiCourseService } from './api/courses';
import { createApiCurriculumService } from './api/curriculum';
import { createApiGrantService } from './api/grants';
import { createApiInviteService } from './api/invites';
import {
  createApiEnrollmentService,
  createApiNoteService,
  createApiProgressService,
  createApiStudioService,
} from './api/learning';
import { createApiUserService } from './api/users';
import type { AuthService } from './auth';
import type { MockServices } from './mock';
import type { Services } from './types';

/**
 * Real API for authentication, users, invites, courses, curriculum, grants, enrollments, progress,
 * quizzes, notes and the Studio dashboard; mock only for what has no backend yet (certificates and
 * settings).
 *
 * The mocked services decide what a user may do from "who is signed in", so the signed-in user is
 * mirrored into the mock as it is read or changed. Nothing else is mirrored: the API owns every
 * course, grant and progress record, and the mocked services do not need them.
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
    grants: { ...createApiInviteService(client), ...createApiGrantService(client) },
    courses: createApiCourseService(client),
    curriculum: createApiCurriculumService(client),
    enrollments: createApiEnrollmentService(client),
    progress: createApiProgressService(client),
    notes: createApiNoteService(client),
    certificates: mock.certificates,
    settings: mock.settings,
    studio: createApiStudioService(client),
  };
}
