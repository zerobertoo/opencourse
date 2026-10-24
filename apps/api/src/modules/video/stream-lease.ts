import { STREAM_LEASE_TTL_SECONDS } from '@opencourse/shared';
import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { sessions, streamLeases } from '../../db/schema';
import type { Database } from '../../plugins/db';

export interface StreamHolder {
  userId: string;
  sessionId: string;
  assetId: string;
  now: Date;
}

/** Writes the lease for this session; `onlyIfFree` leaves a lease that someone else keeps alive alone. */
async function upsertLease(
  db: Pick<Database, 'insert'>,
  { userId, sessionId, assetId, now }: StreamHolder,
  onlyIfFree: boolean,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - STREAM_LEASE_TTL_SECONDS * 1000);
  const rows = await db
    .insert(streamLeases)
    .values({ userId, sessionId, assetId, lastBeatAt: now })
    .onConflictDoUpdate({
      target: streamLeases.userId,
      set: { sessionId, assetId, lastBeatAt: now },
      // dates go in as text: postgres.js cannot bind a Date inside a raw fragment
      setWhere: onlyIfFree
        ? sql`${streamLeases.sessionId} = ${sessionId}
          or ${streamLeases.lastBeatAt} < ${staleBefore.toISOString()}
          or not exists (
            select 1 from ${sessions}
            where ${sessions.id} = ${streamLeases.sessionId}
              and ${sessions.revokedAt} is null
              and ${sessions.expiresAt} > ${now.toISOString()}
          )`
        : undefined,
    })
    .returning({ userId: streamLeases.userId });
  return rows.length > 0;
}

/** `play`: the student pressed play, so this session takes the stream whoever had it. */
export async function claimStream(
  db: Pick<Database, 'insert'>,
  holder: StreamHolder,
): Promise<void> {
  await upsertLease(db, holder, false);
}

/**
 * `beat`: renews the stream when this session already holds it, or when nobody does (the last
 * holder stopped beating or signed out). Returns false when another session holds it, which is
 * the player's cue to pause.
 */
export function renewStream(db: Pick<Database, 'insert'>, holder: StreamHolder): Promise<boolean> {
  return upsertLease(db, holder, true);
}

/** `stop`: the student paused or left, so the stream is free at once instead of after the timeout. */
export async function releaseStream(
  db: Pick<Database, 'delete'>,
  { userId, sessionId }: Pick<StreamHolder, 'userId' | 'sessionId'>,
): Promise<void> {
  await db
    .delete(streamLeases)
    .where(and(eq(streamLeases.userId, userId), eq(streamLeases.sessionId, sessionId)));
}

/** True while a different session of the user is playing: it beat recently and is still signed in. */
export async function isStreamHeldElsewhere(
  db: Pick<Database, 'select'>,
  { userId, sessionId, now }: Omit<StreamHolder, 'assetId'>,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - STREAM_LEASE_TTL_SECONDS * 1000);
  const [held] = await db
    .select({ sessionId: streamLeases.sessionId })
    .from(streamLeases)
    .innerJoin(sessions, eq(sessions.id, streamLeases.sessionId))
    .where(
      and(
        eq(streamLeases.userId, userId),
        gt(streamLeases.lastBeatAt, staleBefore),
        ne(streamLeases.sessionId, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    );
  return held !== undefined;
}
