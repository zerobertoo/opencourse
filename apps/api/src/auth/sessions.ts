import { and, eq, isNull, ne } from 'drizzle-orm';
import type { Database } from '../plugins/db';
import { sessions, users, type SessionRow, type UserRow } from '../db/schema';
import { generateToken, hashToken } from './tokens';

/**
 * After a rotation, the previous refresh token still works for this long. Two tabs refreshing at
 * the same moment would otherwise look like token theft and log the user out.
 */
export const REFRESH_GRACE_MS = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreateSessionInput {
  userId: string;
  userAgent?: string | null;
  ip?: string | null;
  refreshTtlDays: number;
  now: Date;
}

/** Starts a session and returns the refresh token, which exists in plain text only in this result. */
export async function createSession(
  db: Database,
  input: CreateSessionInput,
): Promise<{ session: SessionRow; refreshToken: string }> {
  const refreshToken = generateToken();
  const [session] = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: input.userAgent?.slice(0, 256) ?? null,
      ip: input.ip ?? null,
      lastUsedAt: input.now,
      expiresAt: new Date(input.now.getTime() + input.refreshTtlDays * DAY_MS),
    })
    .returning();
  if (!session) throw new Error('Failed to create session');
  return { session, refreshToken };
}

export type RefreshResult =
  | { status: 'rotated'; session: SessionRow; user: UserRow; refreshToken: string }
  // the token was rotated moments ago by a parallel request: only a new access token is needed
  | { status: 'grace'; session: SessionRow; user: UserRow }
  | { status: 'invalid' };

/**
 * Exchanges a refresh token for a new one. Presenting an already-rotated token after the grace
 * window means it leaked, so the whole session is revoked.
 */
export function refreshSession(
  db: Database,
  presentedToken: string,
  options: { refreshTtlDays: number; now: Date },
): Promise<RefreshResult> {
  const presentedHash = hashToken(presentedToken);
  const { now } = options;

  return db.transaction(async (tx) => {
    const findUser = async (userId: string) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      return user && user.active ? user : undefined;
    };
    const isUsable = (session: SessionRow) => !session.revokedAt && session.expiresAt > now;

    const [current] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, presentedHash))
      .for('update');
    if (current) {
      const user = await findUser(current.userId);
      if (!user || !isUsable(current)) return { status: 'invalid' };

      const refreshToken = generateToken();
      const [rotated] = await tx
        .update(sessions)
        .set({
          refreshTokenHash: hashToken(refreshToken),
          previousRefreshTokenHash: presentedHash,
          rotatedAt: now,
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + options.refreshTtlDays * DAY_MS),
        })
        .where(eq(sessions.id, current.id))
        .returning();
      return { status: 'rotated', session: rotated ?? current, user, refreshToken };
    }

    const [previous] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.previousRefreshTokenHash, presentedHash))
      .for('update');
    if (!previous || !isUsable(previous)) return { status: 'invalid' };

    const withinGrace =
      previous.rotatedAt !== null &&
      now.getTime() - previous.rotatedAt.getTime() < REFRESH_GRACE_MS;
    if (!withinGrace) {
      await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, previous.id));
      return { status: 'invalid' };
    }
    const user = await findUser(previous.userId);
    return user ? { status: 'grace', session: previous, user } : { status: 'invalid' };
  });
}

/** The live session and its user, or null when the session ended or the account is deactivated. */
export async function findActiveSession(
  db: Database,
  sessionId: string,
  now: Date,
): Promise<{ session: SessionRow; user: UserRow } | null> {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId));
  if (!row || row.session.revokedAt || row.session.expiresAt <= now || !row.user.active)
    return null;
  return row;
}

export async function revokeSession(
  db: Pick<Database, 'update'>,
  sessionId: string,
  now: Date,
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Ends every session of a user, optionally keeping the one making the request. */
export async function revokeUserSessions(
  db: Pick<Database, 'update'>,
  userId: string,
  now: Date,
  exceptSessionId?: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    );
}
