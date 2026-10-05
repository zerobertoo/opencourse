import { describe, expect, it } from 'vitest';
import { apiErrorSchema, healthResponseSchema, livenessResponseSchema } from './index';

describe('api contract schemas', () => {
  it('accepts a well-formed error body and rejects unknown codes', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'not_found', message: 'x' } }).success).toBe(
      true,
    );
    expect(apiErrorSchema.safeParse({ error: { code: 'boom', message: 'x' } }).success).toBe(false);
  });

  it('describes readiness per dependency', () => {
    const ok = { status: 'ok', checks: { database: 'up', redis: 'up' } };
    expect(healthResponseSchema.safeParse(ok).success).toBe(true);
    expect(healthResponseSchema.safeParse({ ...ok, checks: { database: 'up' } }).success).toBe(
      false,
    );
  });

  it('describes liveness', () => {
    expect(livenessResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
  });
});
