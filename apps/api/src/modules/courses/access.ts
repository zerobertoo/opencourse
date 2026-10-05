import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { grants, type CourseRow, type UserRow } from '../../db/schema';
import { forbidden, notFound } from '../../errors';
import type { Database } from '../../plugins/db';

export interface CourseAccess {
  /** Admins, and the instructor who owns the course. */
  canManage: boolean;
  /** Whether the course may be shown at all; invisible courses answer 404. */
  isVisible: boolean;
  /** Whether lessons, quizzes and videos may be read. */
  canViewContent: boolean;
}

export function canManageCourse(
  user: Pick<UserRow, 'id' | 'role'>,
  course: Pick<CourseRow, 'instructorId'>,
): boolean {
  return user.role === 'admin' || (user.role === 'instructor' && course.instructorId === user.id);
}

/** A grant counts when it is not revoked and has no expiry date or one in the future. */
export async function hasActiveGrant(
  db: Pick<Database, 'select'>,
  userId: string,
  courseId: string,
  now: Date,
): Promise<boolean> {
  const [grant] = await db
    .select({ id: grants.id })
    .from(grants)
    .where(
      and(
        eq(grants.userId, userId),
        eq(grants.courseId, courseId),
        isNull(grants.revokedAt),
        or(isNull(grants.expiresAt), gt(grants.expiresAt, now)),
      ),
    )
    .limit(1);
  return grant !== undefined;
}

/**
 * Published courses are visible to everyone signed in. Drafts are visible only to managers.
 * Archived courses are visible to managers and to people who still hold an active grant.
 */
export async function resolveCourseAccess(
  db: Pick<Database, 'select'>,
  user: UserRow,
  course: CourseRow,
  now: Date,
): Promise<CourseAccess> {
  const canManage = canManageCourse(user, course);
  if (canManage) return { canManage, isVisible: true, canViewContent: true };

  const granted =
    course.status === 'draft' ? false : await hasActiveGrant(db, user.id, course.id, now);
  const isVisible = course.status === 'published' || (course.status === 'archived' && granted);
  return { canManage, isVisible, canViewContent: isVisible && granted };
}

/**
 * Course the caller may edit. Invisible courses answer the same 404 as missing ones, so a draft's
 * existence does not leak through course, module or lesson ids; visible ones they cannot manage
 * answer 403.
 */
export async function requireManagedCourse(
  db: Pick<Database, 'select'>,
  user: UserRow,
  course: CourseRow | undefined,
  notFoundMessage = 'Course not found',
): Promise<CourseRow> {
  if (!course) throw notFound(notFoundMessage);
  const access = await resolveCourseAccess(db, user, course, new Date());
  if (!access.isVisible) throw notFound(notFoundMessage);
  if (!access.canManage) throw forbidden('Only the course instructor or an admin can edit it');
  return course;
}
