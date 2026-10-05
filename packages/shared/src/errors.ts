import { z } from 'zod';

/**
 * Machine-readable error codes. The first six mirror the web `ServiceErrorCode`,
 * so the real API client can map responses straight onto service errors.
 */
export const apiErrorCodeSchema = z.enum([
  'not_found',
  'unauthorized',
  'forbidden',
  'validation',
  'conflict',
  'unavailable',
  'rate_limited',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Body of every non-2xx API response. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    /** For logs and developers; the UI translates `code` instead. */
    message: z.string(),
    /** Optional extra context, such as per-field validation issues. */
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
