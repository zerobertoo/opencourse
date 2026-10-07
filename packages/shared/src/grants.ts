import { z } from 'zod';
import { idSchema, isoDateSchema } from './base';
import { grantSchema, grantStatusSchema } from './entities';

export const grantIdParamsSchema = z.object({ id: idSchema });

/** The recipient is a user id, never an e-mail, so the endpoint cannot be used to probe addresses. */
export const createGrantRequestSchema = z
  .object({
    userId: idSchema,
    courseId: idSchema,
    /** Null grants lifetime access. */
    expiresAt: isoDateSchema.nullable(),
  })
  .strict();
export type CreateGrantRequest = z.infer<typeof createGrantRequestSchema>;

export const extendGrantRequestSchema = z.object({ expiresAt: isoDateSchema.nullable() }).strict();
export type ExtendGrantRequest = z.infer<typeof extendGrantRequestSchema>;

/** `status` is the effective one: an open grant past its expiry date is `expired`. */
export const listGrantsQuerySchema = z.object({
  courseId: idSchema.optional(),
  userId: idSchema.optional(),
  status: grantStatusSchema.optional(),
});
export type ListGrantsQuery = z.infer<typeof listGrantsQuerySchema>;

export const grantResponseSchema = z.object({ grant: grantSchema });
export type GrantResponse = z.infer<typeof grantResponseSchema>;

export const listGrantsResponseSchema = z.object({ grants: z.array(grantSchema) });
export type ListGrantsResponse = z.infer<typeof listGrantsResponseSchema>;
