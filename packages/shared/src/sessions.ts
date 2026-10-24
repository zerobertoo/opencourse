import { z } from 'zod';
import { idSchema, isoDateSchema } from './base';

/** A signed-in browser of the authenticated user, as shown on "My sessions". */
export const sessionInfoSchema = z.object({
  id: idSchema,
  /** Raw `User-Agent` stored at sign-in; the web app turns it into a browser name. */
  userAgent: z.string().nullable(),
  /** Address the session was started from. */
  ip: z.string().nullable(),
  createdAt: isoDateSchema,
  lastUsedAt: isoDateSchema,
  /** True for the session making the request. */
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const listSessionsResponseSchema = z.object({ sessions: z.array(sessionInfoSchema) });
export type ListSessionsResponse = z.infer<typeof listSessionsResponseSchema>;

export const sessionIdParamsSchema = z.object({ id: idSchema });

/**
 * What the player reports about an uploaded video. `play` is the student pressing play, which
 * takes the account's single stream; `beat` is the periodic signal while playing, which only
 * renews a stream the session already holds.
 */
export const streamHeartbeatRequestSchema = z.object({ event: z.enum(['play', 'beat']) }).strict();
export type StreamHeartbeatRequest = z.infer<typeof streamHeartbeatRequestSchema>;

/** False when another session of the same account took over: the player must pause. */
export const streamHeartbeatResponseSchema = z.object({ active: z.boolean() });
export type StreamHeartbeatResponse = z.infer<typeof streamHeartbeatResponseSchema>;

/** `error.details.reason` of the 409 the key route answers while another session is playing. */
export const STREAM_IN_USE_REASON = 'stream_in_use';

/** How often the player sends `beat` while playing, in seconds. */
export const STREAM_BEAT_INTERVAL_SECONDS = 15;
/** How long a stream stays taken after its last beat (three missed beats), in seconds. */
export const STREAM_LEASE_TTL_SECONDS = 45;
