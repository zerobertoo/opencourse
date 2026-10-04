import type { Role, User } from '@opencourse/shared';
import type { AuthService } from '../auth';
import { ServiceError } from '../errors';
import type { MockContext } from './context';
import { findUserById } from './helpers';
import { DEMO_USER_IDS } from './seed';
import { clone, toPublicInvite, type StoredInvite } from './store';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "maria.silva@x.com" becomes "Maria Silva". */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function assertValidEmail(email: string): void {
  if (!EMAIL_PATTERN.test(email)) throw new ServiceError('validation', 'Invalid email address');
}

function assertValidPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ServiceError(
      'validation',
      `Password must have at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
}

/** Invite with effective status: a pending invite past its expiry date counts as expired. */
function effectiveInvite(invite: StoredInvite, now: Date): StoredInvite {
  const isExpired = invite.status === 'pending' && new Date(invite.expiresAt) <= now;
  return isExpired ? { ...invite, status: 'expired' } : invite;
}

export function createMockAuthService(context: MockContext): AuthService {
  const { store } = context;

  function createStudent(name: string, email: string): User {
    const user: User = {
      id: store.nextId('user'),
      name,
      email,
      avatarUrl: null,
      role: 'student',
      locale: store.db.settings.defaultLocale,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
      active: true,
      createdAt: context.now().toISOString(),
    };
    store.mutate((db) => db.users.push(user));
    return user;
  }

  function startSession(user: User): User {
    if (!user.active) throw new ServiceError('forbidden', 'Account is deactivated');
    context.setSessionUserId(user.id);
    return clone(user);
  }

  return {
    getCurrentUser: () =>
      context.run('auth.getCurrentUser', () => {
        const userId = context.getSessionUserId();
        const user = store.db.users.find((candidate) => candidate.id === userId);
        return user?.active ? clone(user) : null;
      }),

    signIn: (email, password) =>
      context.run('auth.signIn', () => {
        const normalized = normalizeEmail(email);
        assertValidEmail(normalized);
        if (password.length === 0) throw new ServiceError('validation', 'Password is required');
        // the mock accepts any credentials: an unknown e-mail becomes a new student
        const existing = store.db.users.find((user) => user.email === normalized);
        return startSession(existing ?? createStudent(nameFromEmail(normalized), normalized));
      }),

    signInAs: (role: Role) =>
      context.run('auth.signInAs', () => startSession(findUserById(store.db, DEMO_USER_IDS[role]))),

    signUp: (input) =>
      context.run('auth.signUp', () => {
        const email = normalizeEmail(input.email);
        const name = input.name.trim();
        if (name === '') throw new ServiceError('validation', 'Name is required');
        assertValidEmail(email);
        assertValidPassword(input.password);
        if (store.db.users.some((user) => user.email === email)) {
          throw new ServiceError('conflict', 'Email already registered');
        }
        return startSession(createStudent(name, email));
      }),

    signOut: () =>
      context.run('auth.signOut', () => {
        context.setSessionUserId(null);
      }),

    changePassword: (currentPassword, newPassword) =>
      context.run('auth.changePassword', () => {
        context.requireUser();
        // the mock does not store passwords: it only validates the format
        if (currentPassword.length === 0) {
          throw new ServiceError('validation', 'Current password is required');
        }
        assertValidPassword(newPassword);
      }),

    // never reveals whether the e-mail exists
    requestPasswordReset: (email) =>
      context.run('auth.requestPasswordReset', () => {
        assertValidEmail(normalizeEmail(email));
      }),

    resetPassword: (token, newPassword) =>
      context.run('auth.resetPassword', () => {
        if (token.trim() === '') throw new ServiceError('validation', 'Invalid reset token');
        assertValidPassword(newPassword);
      }),

    getInvite: (token) =>
      context.run('auth.getInvite', () => {
        const invite = store.db.invites.find((candidate) => candidate.token === token);
        if (!invite) throw new ServiceError('not_found', 'Invite not found');
        const effective = effectiveInvite(invite, context.now());
        if (effective.status !== 'pending') {
          throw new ServiceError('conflict', `Invite is ${effective.status}`);
        }
        return clone(toPublicInvite(effective));
      }),

    acceptInvite: (token, input) =>
      context.run('auth.acceptInvite', () => {
        const invite = store.db.invites.find((candidate) => candidate.token === token);
        if (!invite) throw new ServiceError('not_found', 'Invite not found');
        const effective = effectiveInvite(invite, context.now());
        if (effective.status !== 'pending') {
          throw new ServiceError('conflict', `Invite is ${effective.status}`);
        }
        const name = input.name.trim();
        if (name === '') throw new ServiceError('validation', 'Name is required');
        assertValidPassword(input.password);
        if (store.db.users.some((user) => user.email === invite.email)) {
          throw new ServiceError('conflict', 'Email already registered');
        }

        const user = createStudent(name, invite.email);
        store.mutate((db) => {
          const stored = db.invites.find((candidate) => candidate.id === invite.id);
          if (stored) stored.status = 'accepted';
          if (invite.courseId) {
            db.grants.push({
              id: store.nextId('grant'),
              userId: user.id,
              courseId: invite.courseId,
              source: 'invite',
              createdById: invite.createdById,
              createdAt: context.now().toISOString(),
              expiresAt: null,
              status: 'active',
            });
          }
        });
        return startSession(user);
      }),
  };
}
