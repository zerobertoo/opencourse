import { ServiceError } from '../errors';
import type { UserService } from '../users';
import type { MockContext } from './context';
import { findUserById } from './helpers';
import { clone } from './store';

export function createMockUserService(context: MockContext): UserService {
  const { store } = context;

  /** Garante que a plataforma sempre tenha ao menos um admin ativo. */
  function assertAnotherActiveAdminExists(userId: string): void {
    const others = store.db.users.filter(
      (user) => user.id !== userId && user.role === 'admin' && user.active,
    );
    if (others.length === 0) {
      throw new ServiceError('conflict', 'The platform needs at least one active admin');
    }
  }

  return {
    list: (filters = {}) =>
      context.run('users.list', () => {
        context.requireRole('admin', 'instructor');
        const search = filters.search?.trim().toLowerCase();
        const users = store.db.users.filter((user) => {
          if (filters.role && user.role !== filters.role) return false;
          if (filters.active !== undefined && user.active !== filters.active) return false;
          if (search) {
            return user.name.toLowerCase().includes(search) || user.email.includes(search);
          }
          return true;
        });
        return clone(users);
      }),

    getById: (id) =>
      context.run('users.getById', () => {
        context.requireUser();
        return clone(findUserById(store.db, id));
      }),

    updateProfile: (input) =>
      context.run('users.updateProfile', () => {
        const current = context.requireUser();
        const user = findUserById(store.db, current.id);
        if (input.name !== undefined && input.name.trim() === '') {
          throw new ServiceError('validation', 'Name is required');
        }
        store.mutate(() => {
          if (input.name !== undefined) user.name = input.name.trim();
          if (input.locale !== undefined) user.locale = input.locale;
          if (input.timeZone !== undefined) user.timeZone = input.timeZone;
        });
        return clone(user);
      }),

    updateRole: (userId, role) =>
      context.run('users.updateRole', () => {
        context.requireRole('admin');
        const user = findUserById(store.db, userId);
        if (user.role === 'admin' && role !== 'admin') assertAnotherActiveAdminExists(userId);
        store.mutate(() => {
          user.role = role;
        });
        return clone(user);
      }),

    setActive: (userId, active) =>
      context.run('users.setActive', () => {
        context.requireRole('admin');
        const user = findUserById(store.db, userId);
        if (!active && user.role === 'admin') assertAnotherActiveAdminExists(userId);
        store.mutate(() => {
          user.active = active;
        });
        return clone(user);
      }),
  };
}
