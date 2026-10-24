import { STREAM_LEASE_TTL_SECONDS } from '@opencourse/shared';
import { and, eq, gt, sql } from 'drizzle-orm';
import { sessions, streamLeases } from '../../db/schema';
import type { Database } from '../../plugins/db';

export interface StreamHolder {
  userId: string;
  sessionId: string;
  assetId: string;
  now: Date;
}

/** `play`: the student pressed play, so this session takes the stream whoever had it. */
export async function claimStream(
  db: Pick<Database, 'insert'>,
  { userId, sessionId, assetId, now }: StreamHolder,
): Promise<void> {
  await db
    .insert(streamLeases)
    .values({ userId, sessionId, assetId, lastBeatAt: now })
    .onConflictDoUpdate({
      target: streamLeases.userId,
      set: { sessionId, assetId, lastBeatAt: now },
    });
}

/**
 * `beat`: renews the stream when this session already holds it, or when nobody does (the last
 * holder stopped beating or signed out). Returns false when another session holds it, which is
 * the player's cue to pause.
 */
export async function renewStream(
  db: Pick<Database, 'insert'>,
  { userId, sessionId, assetId, now }: StreamHolder,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - STREAM_LEASE_TTL_SECONDS * 1000);
  const rows = await db
    .insert(streamLeases)
    .values({ userId, sessionId, assetId, lastBeatAt: now })
    .onConflictDoUpdate({
      target: streamLeases.userId,
      set: { sessionId, assetId, lastBeatAt: now },
      // only the holder, or a lease nobody keeps alive, may be overwritten by a beat
      setWhere: sql`${streamLeases.sessionId} = ${sessionId}
        or ${streamLeases.lastBeatAt} < ${staleBefore.toISOString()}
        or not exists (
          select 1 from ${sessions}
          where ${sessions.id} = ${streamLeases.sessionId}
            and ${sessions.revokedAt} is null
            and ${sessions.expiresAt} > ${now.toISOString()}
        )`,
    })
    .returning({ userId: streamLeases.userId });
  return rows.length > 0;
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
        sql`${streamLeases.sessionId} <> ${sessionId}`,
        sql`${sessions.revokedAt} is null`,
        gt(sessions.expiresAt, now),
      ),
    );
  return held !== undefined;
}
