import { DEFAULT_LOCALE, type Locale, type Role } from '@opencourse/shared';
import { sql } from 'drizzle-orm';
import { users, type UserRow } from '../db/schema';
import { conflict, isUniqueViolation } from '../errors';
import type { Database } from '../plugins/db';

/** Arbitrary constant: serializes every "first user" decision across API instances. */
const BOOTSTRAP_LOCK_ID = 7_301_001;

/** Same constant for changes that could remove the last admin. */
export const ADMIN_GUARD_LOCK_ID = 7_301_002;

export interface CreateUserInput {
  name: string;
  email: string;
  /**
   * Already hashed. Callers hash first so the slow argon2 work never happens while a transaction
   * holds a pooled connection or a row lock (a burst of sign-ups would starve the pool).
   */
  passwordHash: string;
  locale?: Locale | undefined;
  timeZone?: string | undefined;
  /** When true and no user exists yet, the account becomes the admin of the instance. */
  promoteFirstUserToAdmin: boolean;
}

/**
 * Creates an account. The very first account of a self-hosted instance becomes the admin, so
 * there is always someone able to manage it; everyone else starts as a student.
 */
export async function createUser(
  db: Pick<Database, 'transaction'>,
  input: CreateUserInput,
): Promise<UserRow> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK_ID})`);
      const [counted] = await tx.select({ total: sql<number>`count(*)::int` }).from(users);
      const role: Role =
        input.promoteFirstUserToAdmin && counted?.total === 0 ? 'admin' : 'student';

      const [created] = await tx
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          passwordHash: input.passwordHash,
          role,
          locale: input.locale ?? DEFAULT_LOCALE,
          timeZone: input.timeZone ?? 'UTC',
        })
        .returning();
      if (!created) throw new Error('Failed to create user');
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Email already registered');
    throw error;
  }
}
