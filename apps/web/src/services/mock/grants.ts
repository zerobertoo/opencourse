import type { Invite } from '@opencourse/shared';
import { ServiceError } from '../errors';
import type { GrantService } from '../grants';
import type { MockContext } from './context';
import {
  canManageCourse,
  findActiveGrant,
  findCourseById,
  findUserById,
  withEffectiveStatus,
} from './helpers';
import { clone, toPublicInvite, type StoredInvite } from './store';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INVITE_VALIDITY_DAYS = 14;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertFutureOrNull(expiresAt: string | null, now: Date): void {
  if (expiresAt === null) return;
  const time = new Date(expiresAt).getTime();
  if (Number.isNaN(time)) throw new ServiceError('validation', 'Invalid expiration date');
  if (time <= now.getTime())
    throw new ServiceError('validation', 'Expiration must be in the future');
}

export function createMockGrantService(context: MockContext): GrantService {
  const { store } = context;

  function requireGrantManager(courseId: string) {
    const user = context.requireRole('instructor', 'admin');
    const course = findCourseById(store.db, courseId);
    if (!canManageCourse(user, course)) {
      throw new ServiceError(
        'forbidden',
        'Only the course instructor or an admin can manage access',
      );
    }
    return user;
  }

  function findGrant(grantId: string) {
    const grant = store.db.grants.find((candidate) => candidate.id === grantId);
    if (!grant) throw new ServiceError('not_found', `Grant not found: ${grantId}`);
    return grant;
  }

  return {
    list: (filters = {}) =>
      context.run('grants.list', () => {
        const user = context.requireRole('instructor', 'admin');
        const now = context.now();
        const grants = store.db.grants
          .filter((grant) => {
            if (user.role === 'instructor') {
              const course = findCourseById(store.db, grant.courseId);
              if (!canManageCourse(user, course)) return false;
            }
            return (
              (!filters.courseId || grant.courseId === filters.courseId) &&
              (!filters.userId || grant.userId === filters.userId)
            );
          })
          .map((grant) => withEffectiveStatus(grant, now))
          .filter((grant) => !filters.status || grant.status === filters.status)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return clone(grants);
      }),

    create: (input) =>
      context.run('grants.create', () => {
        const manager = requireGrantManager(input.courseId);
        const now = context.now();
        findUserById(store.db, input.userId);
        assertFutureOrNull(input.expiresAt, now);
        if (findActiveGrant(store.db, input.userId, input.courseId, now)) {
          throw new ServiceError('conflict', 'User already has active access to this course');
        }

        const grant = {
          id: store.nextId('grant'),
          userId: input.userId,
          courseId: input.courseId,
          source: 'manual' as const,
          createdById: manager.id,
          createdAt: now.toISOString(),
          expiresAt: input.expiresAt,
          status: 'active' as const,
        };
        store.mutate((db) => db.grants.push(grant));
        return clone(grant);
      }),

    revoke: (grantId) =>
      context.run('grants.revoke', () => {
        const grant = findGrant(grantId);
        requireGrantManager(grant.courseId);
        store.mutate(() => {
          grant.status = 'revoked';
        });
        return clone(withEffectiveStatus(grant, context.now()));
      }),

    extend: (grantId, expiresAt) =>
      context.run('grants.extend', () => {
        const grant = findGrant(grantId);
        requireGrantManager(grant.courseId);
        const now = context.now();
        assertFutureOrNull(expiresAt, now);
        if (grant.status === 'revoked') {
          throw new ServiceError('conflict', 'A revoked grant cannot be extended');
        }
        store.mutate(() => {
          grant.expiresAt = expiresAt;
          grant.status = 'active';
        });
        return clone(withEffectiveStatus(grant, now));
      }),

    createInvite: (input) =>
      context.run('grants.createInvite', () => {
        const manager = input.courseId
          ? requireGrantManager(input.courseId)
          : context.requireRole('instructor', 'admin');
        const email = input.email.trim().toLowerCase();
        if (!EMAIL_PATTERN.test(email))
          throw new ServiceError('validation', 'Invalid email address');

        const now = context.now();
        const expiresAt =
          input.expiresAt ??
          new Date(now.getTime() + DEFAULT_INVITE_VALIDITY_DAYS * DAY_MS).toISOString();
        assertFutureOrNull(expiresAt, now);

        const invite: StoredInvite = {
          id: store.nextId('invite'),
          email,
          courseId: input.courseId ?? null,
          token: `convite-${store.nextId('token')}-${Math.floor(context.random() * 1e9).toString(36)}`,
          createdById: manager.id,
          createdAt: now.toISOString(),
          expiresAt,
          status: 'pending',
        };
        store.mutate((db) => db.invites.push(invite));
        return {
          invite: clone(toPublicInvite(invite)),
          acceptUrl: `${window.location.origin}/invite/${invite.token}`,
        };
      }),

    listInvites: (filters = {}) =>
      context.run('grants.listInvites', () => {
        const user = context.requireRole('instructor', 'admin');
        const now = context.now();
        const invites = store.db.invites
          .filter((invite) => {
            if (filters.courseId && invite.courseId !== filters.courseId) return false;
            if (user.role === 'instructor') return invite.createdById === user.id;
            return true;
          })
          .map((invite): Invite =>
            toPublicInvite(
              invite.status === 'pending' && new Date(invite.expiresAt) <= now
                ? { ...invite, status: 'expired' }
                : invite,
            ),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return clone(invites);
      }),
  };
}
