import { z } from 'zod';

export const dependencyStatusSchema = z.enum(['up', 'down']);
export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

/** Liveness: the process is running. Does not touch any dependency. */
export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
});
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

/** Readiness: reports each dependency. `status` is `ok` only when all are up. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  checks: z.object({
    database: dependencyStatusSchema,
    redis: dependencyStatusSchema,
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
