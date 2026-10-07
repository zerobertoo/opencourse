import type { CourseDetail, Grant, User } from '@opencourse/shared';
import { createApiAuthService, type ApiPreferences } from './api/auth';
import type { ApiClient } from './api/client';
import { createApiCourseService } from './api/courses';
import { createApiCurriculumService } from './api/curriculum';
import { createApiGrantService } from './api/grants';
import { createApiInviteService } from './api/invites';
import { createApiUserService } from './api/users';
import type { AuthService } from './auth';
import type { CourseService } from './courses';
import { isServiceError, ServiceError } from './errors';
import type { CurriculumService } from './curriculum';
import type { GrantService } from './grants';
import type { MockServices } from './mock';
import type { Services } from './types';

/**
 * Real API for authentication, users, invites, courses, curriculum and grants; mock for what has
 * no backend yet (enrollments, progress, notes, certificates, settings, studio dashboard).
 *
 * The mock services decide what a user may do from "who is signed in" and read courses and grants
 * from their own store. With the real API owning the data, the signed-in user, the courses and
 * the grants are mirrored into the mock as they are read or changed, so the mocked screens keep
 * working for real accounts. The mirror is cleared when the account changes. This bridge shrinks
 * as each remaining area gets its backend.
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

  const mirrorCourse = <T extends CourseDetail>(course: T): T => {
    mock.mock.upsertCourse(course);
    return course;
  };
  const mirrorResult = <T extends { course: CourseDetail }>(result: T): T => {
    mirrorCourse(result.course);
    return result;
  };

  const apiCourses = createApiCourseService(client);
  const courses: CourseService = {
    async list(filters) {
      const listed = await apiCourses.list(filters);
      const userId = mock.mock.sessionUserId();
      for (const item of listed) {
        const { moduleCount, lessonCount, durationSeconds, completeLocales, myGrant, ...course } =
          item;
        void [moduleCount, lessonCount, durationSeconds, completeLocales];
        mock.mock.upsertCourseSummary(course);
        if (userId) mock.mock.setOwnGrant(userId, item.id, myGrant);
      }
      return listed;
    },
    getBySlug: async (slug) => mirrorCourse(await apiCourses.getBySlug(slug)),
    getById: async (id) => mirrorCourse(await apiCourses.getById(id)),
    create: async (input) => mirrorCourse(await apiCourses.create(input)),
    update: async (id, input) => mirrorCourse(await apiCourses.update(id, input)),
  };

  const apiCurriculum = createApiCurriculumService(client);
  const curriculum: CurriculumService = {
    ...apiCurriculum,
    createModule: async (input) => mirrorResult(await apiCurriculum.createModule(input)),
    updateModule: async (id, input) => mirrorCourse(await apiCurriculum.updateModule(id, input)),
    deleteModule: async (id) => mirrorCourse(await apiCurriculum.deleteModule(id)),
    createLesson: async (input) => mirrorResult(await apiCurriculum.createLesson(input)),
    updateLesson: async (id, input) => mirrorCourse(await apiCurriculum.updateLesson(id, input)),
    deleteLesson: async (id) => mirrorCourse(await apiCurriculum.deleteLesson(id)),
    setLessonVideo: async (id, source) =>
      mirrorCourse(await apiCurriculum.setLessonVideo(id, source)),
    removeLessonVideo: async (id) => mirrorCourse(await apiCurriculum.removeLessonVideo(id)),
    reorder: async (courseId, layout) =>
      mirrorCourse(await apiCurriculum.reorder(courseId, layout)),
  };

  /**
   * Mirrors grants with the people they belong to: the mocked screens look both up together, and
   * a grant whose user cannot be read is left out rather than breaking them.
   */
  const mirrorGrants = async (grants: Grant[]): Promise<void> => {
    const known = new Set(mock.mock.store.db.users.map((account) => account.id));
    const missing = [...new Set(grants.map((grant) => grant.userId))].filter(
      (userId) => !known.has(userId),
    );
    await Promise.all(
      missing.map((userId) =>
        apiUsers.getById(userId).then(
          (account) => {
            mock.mock.upsertUser(account);
          },
          () => undefined,
        ),
      ),
    );
    const present = new Set(mock.mock.store.db.users.map((account) => account.id));
    for (const grant of grants) {
      if (present.has(grant.userId)) mock.mock.upsertGrant(grant);
    }
  };

  const apiGrants = createApiGrantService(client);
  const mirrorGrant = async (grant: Grant): Promise<Grant> => {
    await mirrorGrants([grant]);
    return grant;
  };
  const grants: GrantService = {
    ...createApiInviteService(client),
    async list(filters) {
      const listed = await apiGrants.list(filters);
      await mirrorGrants(listed);
      return listed;
    },
    create: async (input) => mirrorGrant(await apiGrants.create(input)),
    revoke: async (grantId) => mirrorGrant(await apiGrants.revoke(grantId)),
    extend: async (grantId, expiresAt) => mirrorGrant(await apiGrants.extend(grantId, expiresAt)),
  };

  /**
   * The mocked enrollments read the mirror, and no screen has listed the catalog before the home
   * page asks what the student is enrolled in. So the catalog is read first, together with the
   * curriculum of every course the student can open and that the mirror does not hold yet.
   */
  const syncEnrollments = async (): Promise<void> => {
    const catalog = await courses.list();
    const userId = mock.mock.sessionUserId();
    if (userId) {
      mock.mock.dropUnlisted(
        userId,
        catalog.map((course) => course.id),
      );
    }
    const opened = new Set(
      mock.mock.store.db.courses.filter((course) => course.modules.length > 0).map((c) => c.id),
    );
    const wanted = catalog.filter(
      (course) =>
        course.myGrant?.status === 'active' &&
        course.status === 'published' &&
        !opened.has(course.id),
    );
    // a course that cannot be read (removed meanwhile, say) just stays out of the list
    await Promise.all(wanted.map((course) => courses.getById(course.id).catch(() => undefined)));
  };

  const enrollments: Services['enrollments'] = {
    ...mock.enrollments,
    listMyCourses: async () => {
      await syncEnrollments();
      return mock.enrollments.listMyCourses();
    },
    getContinueLearning: async () => {
      await syncEnrollments();
      return mock.enrollments.getContinueLearning();
    },
    canAccess: async (courseId) => {
      await syncEnrollments();
      // a course the catalog does not hold is one the user cannot open, not an error
      return mock.enrollments.canAccess(courseId).catch((error: unknown) => {
        if (isServiceError(error) && error.code === 'not_found') return false;
        throw error;
      });
    },
    listCourseStudents: async (courseId) => {
      await Promise.all([courses.getById(courseId), grants.list({ courseId })]);
      return mock.enrollments.listCourseStudents(courseId);
    },
  };

  /**
   * The API keeps correct answers from students, so the mirrored quiz cannot be graded here:
   * scoring it would fail every answer and lock the course. Grading arrives with its backend.
   */
  const progress: Services['progress'] = {
    ...mock.progress,
    submitQuizAttempt: (lessonId, answers) => {
      const lesson = mock.mock.store.db.courses
        .flatMap((course) => course.modules.flatMap((courseModule) => courseModule.lessons))
        .find((candidate) => candidate.id === lessonId);
      const hidden =
        lesson?.type === 'quiz' &&
        lesson.quiz.questions.some((question) =>
          question.options.every((option) => option.isCorrect === undefined),
        );
      if (hidden) {
        return Promise.reject(
          new ServiceError('unavailable', 'Quiz grading is not available yet for students'),
        );
      }
      return mock.progress.submitQuizAttempt(lessonId, answers);
    },
  };

  const studio: Services['studio'] = {
    ...mock.studio,
    getDashboard: async () => {
      await Promise.all([courses.list({ scope: 'managed' }), grants.list()]);
      return mock.studio.getDashboard();
    },
  };

  return {
    auth,
    users,
    grants,
    courses,
    curriculum,
    enrollments,
    progress,
    notes: mock.notes,
    certificates: mock.certificates,
    settings: mock.settings,
    studio,
  };
}
