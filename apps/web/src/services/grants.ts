import type { Grant, GrantStatus, Invite } from '@opencourse/shared';

export interface GrantFilters {
  courseId?: string;
  userId?: string;
  status?: GrantStatus;
}

export interface CreateGrantInput {
  userId: string;
  courseId: string;
  /** Nulo concede acesso vitalício. */
  expiresAt: string | null;
}

export interface CreateInviteInput {
  email: string;
  courseId?: string;
  /** Validade do convite; por padrão 14 dias. */
  expiresAt?: string;
}

export interface GrantService {
  /** Status já normalizado: concessões vencidas aparecem como `expired`. */
  list(filters?: GrantFilters): Promise<Grant[]>;
  /** Instrutor do curso ou admin. Lança `conflict` se já existir concessão ativa. */
  create(input: CreateGrantInput): Promise<Grant>;
  revoke(grantId: string): Promise<Grant>;
  /** Define a nova validade (nulo para vitalício) e reativa concessões expiradas. */
  extend(grantId: string, expiresAt: string | null): Promise<Grant>;
  createInvite(input: CreateInviteInput): Promise<Invite>;
  listInvites(filters?: { courseId?: string }): Promise<Invite[]>;
}
