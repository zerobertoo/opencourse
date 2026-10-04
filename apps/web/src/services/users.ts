import type { Locale, Role, User } from '@opencourse/shared';

export interface UserFilters {
  /** Searches by name or e-mail. */
  search?: string;
  role?: Role;
  active?: boolean;
}

export interface UpdateProfileInput {
  name?: string;
  locale?: Locale;
  timeZone?: string;
}

export interface UserService {
  list(filters?: UserFilters): Promise<User[]>;
  getById(id: string): Promise<User>;
  /** Updates the authenticated user's profile. */
  updateProfile(input: UpdateProfileInput): Promise<User>;
  /** Admin only. */
  updateRole(userId: string, role: Role): Promise<User>;
  /** Admin only. A deactivated user cannot sign in. */
  setActive(userId: string, active: boolean): Promise<User>;
}
