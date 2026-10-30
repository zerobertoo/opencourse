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
