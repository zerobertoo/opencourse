import { z } from 'zod';
import { idSchema, isoDateSchema, localeSchema, roleSchema } from './base';
import { inviteSchema, userSchema } from './entities';

/**
 * Header every state-changing request must carry. Browsers cannot add a custom header on a
 * cross-site form post, so requiring it (together with a strict CORS allowlist) blocks CSRF.
 */
export const CSRF_HEADER_NAME = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'opencourse';

export const PASSWORD_MIN_LENGTH = 8;
/** Upper bound keeps argon2 from hashing megabytes of attacker-controlled input. */
export const PASSWORD_MAX_LENGTH = 128;

/** E-mails are compared case-insensitively, so they are normalized on the way in. */
export const emailInputSchema = z.string().trim().toLowerCase().pipe(z.email());

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const NAME_MAX_LENGTH = 120;

const nameSchema = z.string().trim().min(1).max(NAME_MAX_LENGTH);

/** True when the runtime recognizes the name as an IANA time zone, such as `America/Sao_Paulo`. */
function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Checked here because the UI feeds it to `Intl.DateTimeFormat`, which throws on an unknown zone. */
const timeZoneSchema = z.string().min(1).max(64).refine(isKnownTimeZone, 'Unknown time zone');

// ---------- Authentication ----------

export const registerRequestSchema = z.object({
  name: nameSchema,
  email: emailInputSchema,
  password: passwordSchema,
  /** Defaults to the platform language / UTC when omitted. */
  locale: localeSchema.optional(),
  timeZone: timeZoneSchema.optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailInputSchema,
  // no length rule here: login must not reveal the password policy
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Response of every call that starts or reads a session. */
export const sessionResponseSchema = z.object({ user: userSchema });
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailInputSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1).max(256),
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

// ---------- Profile and users ----------

export const updateProfileRequestSchema = z.object({
  name: nameSchema.optional(),
  locale: localeSchema.optional(),
  timeZone: timeZoneSchema.optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: roleSchema.optional(),
  // query strings carry booleans as text
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const listUsersResponseSchema = z.object({ users: z.array(userSchema) });
export type ListUsersResponse = z.infer<typeof listUsersResponseSchema>;

export const updateUserRoleRequestSchema = z.object({ role: roleSchema });
export type UpdateUserRoleRequest = z.infer<typeof updateUserRoleRequestSchema>;

export const setUserActiveRequestSchema = z.object({ active: z.boolean() });
export type SetUserActiveRequest = z.infer<typeof setUserActiveRequestSchema>;

export const userResponseSchema = z.object({ user: userSchema });
export type UserResponse = z.infer<typeof userResponseSchema>;

// ---------- Invites ----------

export const createInviteRequestSchema = z.object({
  email: emailInputSchema,
  courseId: idSchema.optional(),
  /** Defaults to 14 days from now. */
  expiresAt: isoDateSchema.optional(),
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

/** The acceptance link is only ever returned here, never in listings. */
export const createInviteResponseSchema = z.object({
  invite: inviteSchema,
  acceptUrl: z.string().min(1),
});
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;

export const listInvitesQuerySchema = z.object({ courseId: idSchema.optional() });
export type ListInvitesQuery = z.infer<typeof listInvitesQuerySchema>;

export const listInvitesResponseSchema = z.object({ invites: z.array(inviteSchema) });
export type ListInvitesResponse = z.infer<typeof listInvitesResponseSchema>;

export const inviteResponseSchema = z.object({ invite: inviteSchema });
export type InviteResponse = z.infer<typeof inviteResponseSchema>;

export const acceptInviteRequestSchema = z.object({
  name: nameSchema,
  password: passwordSchema,
  locale: localeSchema.optional(),
  timeZone: timeZoneSchema.optional(),
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

// ---------- Audit log ----------

export const auditLogEntrySchema = z.object({
  id: idSchema,
  /** Null when the actor was removed or the action was system-initiated. */
  actorId: idSchema.nullable(),
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: idSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: isoDateSchema,
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const listAuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;

export const listAuditLogResponseSchema = z.object({ entries: z.array(auditLogEntrySchema) });
export type ListAuditLogResponse = z.infer<typeof listAuditLogResponseSchema>;
