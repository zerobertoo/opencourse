import type { Grant, GrantStatus, Invite } from '@opencourse/shared';

export interface GrantFilters {
  courseId?: string;
  userId?: string;
  status?: GrantStatus;
}

export interface CreateGrantInput {
  userId: string;
  courseId: string;
  /** Null grants lifetime access. */
  expiresAt: string | null;
}

export interface CreateInviteInput {
  email: string;
  courseId?: string;
  /** Invite expiry; 14 days by default. */
  expiresAt?: string;
}

/** Result of creating an invite: the invite itself and the one-time link to hand to the invitee. */
export interface CreatedInvite {
  invite: Invite;
  /** Absolute URL of the acceptance page. Only returned here; listings never expose the token. */
  acceptUrl: string;
}

export interface GrantService {
  /** Already normalized status: expired grants show up as `expired`. */
  list(filters?: GrantFilters): Promise<Grant[]>;
  /** Course instructor or admin. Throws `conflict` if an active grant already exists. */
  create(input: CreateGrantInput): Promise<Grant>;
  revoke(grantId: string): Promise<Grant>;
  /** Sets the new expiry (null for lifetime) and reactivates expired grants. */
  extend(grantId: string, expiresAt: string | null): Promise<Grant>;
  createInvite(input: CreateInviteInput): Promise<CreatedInvite>;
  listInvites(filters?: { courseId?: string }): Promise<Invite[]>;
}
