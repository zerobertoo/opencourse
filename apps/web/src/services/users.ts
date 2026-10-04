import type { Locale, Role, User } from '@opencourse/shared';

export interface UserFilters {
  /** Busca por nome ou e-mail. */
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
  /** Atualiza o perfil do usuário autenticado. */
  updateProfile(input: UpdateProfileInput): Promise<User>;
  /** Somente admin. */
  updateRole(userId: string, role: Role): Promise<User>;
  /** Somente admin. Usuário desativado não consegue entrar. */
  setActive(userId: string, active: boolean): Promise<User>;
}
